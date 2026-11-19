// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sound = vi.hoisted(() => ({ beep: vi.fn(), vibrate: vi.fn() }))
vi.mock('../lib/sound.js', () => sound)
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})) }))
const relay = vi.hoisted(() => ({ scheduleRestPush: vi.fn(), cancelRestPush: vi.fn(), restPushOn: vi.fn(() => false) }))
vi.mock('../lib/rest-push.js', () => relay)
import { useUI, REST_LATE_MS } from './useUI.js'

beforeEach(() => { vi.useFakeTimers(); sound.beep.mockClear(); sound.vibrate.mockClear(); relay.scheduleRestPush.mockClear(); relay.cancelRestPush.mockClear(); relay.restPushOn.mockReturnValue(false); useUI.setState({ timer: null, toastMsg: '' }) })
afterEach(() => { useUI.getState().stopRest(); vi.useRealTimers() })

describe('rest timer end', () => {
  it('alerts when the rest runs out on time', () => {
    useUI.getState().startRest(3)
    vi.advanceTimersByTime(3000)
    expect(useUI.getState().timer).toBeNull()
    expect(sound.vibrate).toHaveBeenCalled()
    expect(useUI.getState().toastMsg).toBe('Rest over — next set!')
  })

  it('stays quiet when it ran out while the app was suspended', () => {
    useUI.getState().startRest(60)
    // The page was frozen: the clock moved on, no interval ran. Then it wakes.
    vi.setSystemTime(Date.now() + 60_000 + REST_LATE_MS + 120_000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(useUI.getState().timer).toBeNull()
    expect(sound.beep).not.toHaveBeenCalled()
    expect(sound.vibrate).not.toHaveBeenCalled()
    expect(useUI.getState().toastMsg).toMatch(/^Rest ended 2:0\d ago$/)
  })
})

describe('the lock-screen relay', () => {
  it('is told when the rest ends, again when it changes, and called off when it is skipped', () => {
    const t0 = Date.now()
    useUI.getState().startRest(90)
    expect(relay.scheduleRestPush).toHaveBeenLastCalledWith(t0 + 90_000)
    useUI.getState().addRest(15)
    expect(relay.scheduleRestPush).toHaveBeenLastCalledWith(t0 + 105_000)
    useUI.getState().stopRest()
    expect(relay.cancelRestPush).toHaveBeenCalledTimes(1)
  })

  it('is called off in the last seconds when the app is on screen, so only one alert lands', () => {
    useUI.getState().startRest(10)
    vi.advanceTimersByTime(7000)
    expect(relay.cancelRestPush).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(relay.cancelRestPush).toHaveBeenCalledTimes(1)
  })
})

describe('one notification, not two', () => {
  const hide = v => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (v ? 'hidden' : 'visible') })
  const notified = () => {
    const showNotification = vi.fn()
    Object.defineProperty(globalThis, 'Notification', { configurable: true, value: Object.assign(vi.fn(), { permission: 'granted' }) })
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: () => Promise.resolve({ showNotification }) } })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => document.visibilityState === 'hidden' })
    return showNotification
  }
  afterEach(() => hide(false))

  it('with the relay on, a rest ending in the background leaves the notification to the push', async () => {
    const show = notified()
    relay.restPushOn.mockReturnValue(true)
    hide(true)
    useUI.getState().startRest(3)
    vi.advanceTimersByTime(3000)
    await vi.runAllTimersAsync()
    expect(useUI.getState().timer).toBeNull()
    expect(show).not.toHaveBeenCalled()
    expect(relay.cancelRestPush).not.toHaveBeenCalled()   // the push it relies on stays queued
  })

  it('without the relay, the page still shows its own notification in the background', async () => {
    const show = notified()
    hide(true)
    useUI.getState().startRest(3)
    vi.advanceTimersByTime(3000)
    await vi.runAllTimersAsync()
    expect(show).toHaveBeenCalledTimes(1)
    expect(show.mock.calls[0][1].tag).toBe('rest')
  })
})

// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sound = vi.hoisted(() => ({ beep: vi.fn(), vibrate: vi.fn() }))
vi.mock('../lib/sound.js', () => sound)
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})) }))
import { useUI, REST_LATE_MS } from './useUI.js'

beforeEach(() => { vi.useFakeTimers(); sound.beep.mockClear(); sound.vibrate.mockClear(); useUI.setState({ timer: null, toastMsg: '' }) })
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

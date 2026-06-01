import { describe, it, expect } from 'vitest'
import { predictionDelta, deltaColor, avgAccuracy } from '../pages/Films.jsx'

// ─── Guess the Picker ─────────────────────────────────────────────────────────

describe('Guess the Picker — result logic', () => {
  it('is correct when guessed_user_id === picked_by_user_id', () => {
    const guess = { guessed_user_id: 'user-a' }
    const movie = { picked_by_user_id: 'user-a' }
    expect(guess.guessed_user_id === movie.picked_by_user_id).toBe(true)
  })

  it('is incorrect when guessed_user_id !== picked_by_user_id', () => {
    const guess = { guessed_user_id: 'user-b' }
    const movie = { picked_by_user_id: 'user-a' }
    expect(guess.guessed_user_id === movie.picked_by_user_id).toBe(false)
  })

  it('returns false when guess is null', () => {
    const guess = null
    const movie = { picked_by_user_id: 'user-a' }
    expect(guess?.guessed_user_id === movie.picked_by_user_id).toBeFalsy()
  })
})

// ─── Prediction Delta ─────────────────────────────────────────────────────────

describe('predictionDelta', () => {
  it('returns absolute difference between predicted and actual', () => {
    expect(predictionDelta(7.5, 6.0)).toBeCloseTo(1.5)
  })

  it('returns absolute value (positive) when actual > predicted', () => {
    expect(predictionDelta(5.0, 8.0)).toBeCloseTo(3.0)
  })

  it('returns 0 when predicted equals actual', () => {
    expect(predictionDelta(7.25, 7.25)).toBe(0)
  })

  it('returns null when predicted is null', () => {
    expect(predictionDelta(null, 7.0)).toBeNull()
  })

  it('returns null when actual is null', () => {
    expect(predictionDelta(6.5, null)).toBeNull()
  })
})

// ─── Delta Color Coding ───────────────────────────────────────────────────────

describe('deltaColor', () => {
  it('returns green for delta <= 1.0', () => {
    expect(deltaColor(0)).toBe('#86efac')
    expect(deltaColor(0.5)).toBe('#86efac')
    expect(deltaColor(1.0)).toBe('#86efac')
  })

  it('returns yellow for delta > 1.0 and <= 2.0', () => {
    expect(deltaColor(1.01)).toBe('#fbbf24')
    expect(deltaColor(1.5)).toBe('#fbbf24')
    expect(deltaColor(2.0)).toBe('#fbbf24')
  })

  it('returns red for delta > 2.0', () => {
    expect(deltaColor(2.01)).toBe('#f87171')
    expect(deltaColor(5.0)).toBe('#f87171')
  })

  it('returns fallback color when delta is null', () => {
    const result = deltaColor(null)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

// ─── Average Accuracy ─────────────────────────────────────────────────────────

describe('avgAccuracy', () => {
  const ratings = [
    { user_id: 'user-a', score: '7.00' },
    { user_id: 'user-b', score: '5.00' },
    { user_id: 'user-c', score: '9.00' },
  ]

  it('calculates average delta across predictions with actual scores', () => {
    const predictions = [
      { target_user_id: 'user-a', predicted_score: '8.00' }, // delta 1.0
      { target_user_id: 'user-b', predicted_score: '4.00' }, // delta 1.0
    ]
    expect(avgAccuracy(predictions, ratings)).toBeCloseTo(1.0)
  })

  it('ignores predictions for users with no actual score', () => {
    const predictions = [
      { target_user_id: 'user-a', predicted_score: '7.00' }, // delta 0
      { target_user_id: 'user-z', predicted_score: '5.00' }, // no actual score
    ]
    expect(avgAccuracy(predictions, ratings)).toBeCloseTo(0)
  })

  it('returns null when there are no matching predictions/ratings', () => {
    const predictions = [
      { target_user_id: 'user-z', predicted_score: '5.00' },
    ]
    expect(avgAccuracy(predictions, ratings)).toBeNull()
  })

  it('returns null for empty predictions array', () => {
    expect(avgAccuracy([], ratings)).toBeNull()
  })
})

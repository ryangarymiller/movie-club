import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import Avatar from './Avatar'

const MONO = "'DM Mono', monospace"
const SANS = "'DM Sans', sans-serif"
const DISPLAY = "'Bebas Neue', sans-serif"

const GREEN = '#86efac'
const RED = '#f87171'

const TEST_EMAIL = 'i.am.ryan.the.miller@gmail.com'

function Label({ children }) {
  return (
    <span style={{ fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-dim)' }}>
      {children}
    </span>
  )
}

export default function GuessThePicker({ movieId, currentUserId, users = [], pickerRevealed = false, pickedByUserId = null }) {
  const [myGuess, setMyGuess] = useState(null) // guessed_user_id (string) | null
  const [allGuesses, setAllGuesses] = useState([]) // [{ guessing_user_id, guessed_user_id }]
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // id -> safe (non-test) user record
  const userMap = useMemo(() => {
    const m = new Map()
    for (const u of users) {
      if (!u || !u.id) continue
      if (u.email && u.email.toLowerCase() === TEST_EMAIL) continue
      m.set(u.id, u)
    }
    return m
  }, [users])

  const nameOf = useCallback((id) => userMap.get(id)?.name || 'Unknown member', [userMap])
  const isTest = useCallback((id) => {
    const u = users.find(x => x && x.id === id)
    return !!(u && u.email && u.email.toLowerCase() === TEST_EMAIL)
  }, [users])

  // Candidates you may guess: everyone except yourself and the hidden test account.
  const candidates = useMemo(
    () => [...userMap.values()]
      .filter(u => u.id !== currentUserId)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [userMap, currentUserId]
  )

  const load = useCallback(async () => {
    if (!movieId) {
      setLoading(false)
      setError('No film specified.')
      return
    }
    setLoading(true)
    setError(null)

    if (pickerRevealed) {
      // RLS now permits reading everyone's guesses for this movie.
      const { data, error: dbErr } = await supabase
        .from('picker_guesses')
        .select('guessing_user_id, guessed_user_id')
        .eq('movie_id', movieId)
      if (dbErr) {
        setError('Could not load guesses.')
        setAllGuesses([])
      } else {
        setAllGuesses(data ?? [])
        const mine = (data ?? []).find(g => g.guessing_user_id === currentUserId)
        setMyGuess(mine ? mine.guessed_user_id : null)
      }
    } else {
      // Pre-reveal: RLS only returns own rows.
      const { data, error: dbErr } = await supabase
        .from('picker_guesses')
        .select('guessed_user_id')
        .eq('movie_id', movieId)
        .eq('guessing_user_id', currentUserId)
      if (dbErr) {
        setError('Could not load your guess.')
        setMyGuess(null)
      } else {
        setMyGuess(data && data.length ? data[0].guessed_user_id : null)
      }
    }
    setLoading(false)
  }, [movieId, currentUserId, pickerRevealed])

  useEffect(() => {
    let alive = true
    ;(async () => {
      await load()
      if (!alive) return
    })()
    return () => { alive = false }
  }, [load])

  async function saveGuess(guessedUserId) {
    if (saving || !movieId || !currentUserId || !guessedUserId) return
    if (guessedUserId === currentUserId) return // can't guess yourself
    setSaving(true)
    setError(null)
    const prev = myGuess
    setMyGuess(guessedUserId) // optimistic

    // No unique constraint guaranteed yet: delete-then-insert keeps one row per guesser.
    const { error: delErr } = await supabase
      .from('picker_guesses')
      .delete()
      .eq('movie_id', movieId)
      .eq('guessing_user_id', currentUserId)
    if (delErr) {
      setMyGuess(prev)
      setError('Could not save your guess. Try again.')
      setSaving(false)
      return
    }

    const { error: insErr } = await supabase
      .from('picker_guesses')
      .insert({
        movie_id: movieId,
        guessing_user_id: currentUserId,
        guessed_user_id: guessedUserId,
      })
    if (insErr) {
      setMyGuess(prev)
      setError('Could not save your guess. Try again.')
    }
    setSaving(false)
  }

  const cardStyle = {
    background: 'var(--surface-2)',
    border: '1px solid rgba(var(--fg-rgb),0.1)',
    borderRadius: '14px',
    padding: '16px',
    maxWidth: '460px',
  }

  // --- Loading ---
  if (loading) {
    return (
      <section aria-label="Guess the picker" aria-busy="true" style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <Label>Guess the Picker</Label>
        </div>
        <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>Loading…</p>
      </section>
    )
  }

  // ============================ POST-REVEAL ============================
  if (pickerRevealed) {
    const pickerName = pickedByUserId ? nameOf(pickedByUserId) : null

    // Only real (non-test) guessers, sorted by name.
    const visibleGuesses = allGuesses
      .filter(g => userMap.has(g.guessing_user_id))
      .sort((a, b) => nameOf(a.guessing_user_id).localeCompare(nameOf(b.guessing_user_id)))

    const myRow = visibleGuesses.find(g => g.guessing_user_id === currentUserId)
    const iGuessed = !!myRow
    const iWasCorrect = iGuessed && pickedByUserId && myRow.guessed_user_id === pickedByUserId
    const correctCount = pickedByUserId
      ? visibleGuesses.filter(g => g.guessed_user_id === pickedByUserId).length
      : 0

    return (
      <section aria-label="Guess the picker results" style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
          <Label>Guess the Picker</Label>
          {pickerName && (
            <span style={{ fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)' }}>
              {correctCount}/{visibleGuesses.length} correct
            </span>
          )}
        </div>

        {/* Revealed picker */}
        {pickerName ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <Avatar user={userMap.get(pickedByUserId) ?? { name: pickerName }} size={32} />
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontFamily: MONO, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)', marginBottom: '3px' }}>
                Picked by
              </div>
              <div style={{ fontFamily: DISPLAY, fontSize: '1.35rem', letterSpacing: '0.03em', color: 'var(--text-strong)' }}>
                {pickerName}
              </div>
            </div>
          </div>
        ) : (
          <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 14px' }}>
            Picker identity is unavailable.
          </p>
        )}

        {/* Current-user outcome banner */}
        {iGuessed ? (
          <div
            role="status"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: iWasCorrect ? 'rgba(134,239,172,0.12)' : 'rgba(248,113,113,0.1)',
              border: `1px solid ${iWasCorrect ? 'rgba(134,239,172,0.4)' : 'rgba(248,113,113,0.35)'}`,
              borderRadius: '10px',
              padding: '11px 12px',
              marginBottom: visibleGuesses.length ? '14px' : 0,
            }}
          >
            <span aria-hidden="true" style={{ fontSize: '18px', lineHeight: 1, color: iWasCorrect ? GREEN : RED }}>
              {iWasCorrect ? '✓' : '✗'}
            </span>
            <span style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text)', lineHeight: 1.4 }}>
              {iWasCorrect
                ? 'You guessed it right!'
                : <>You guessed <strong style={{ color: 'var(--text-strong)' }}>{nameOf(myRow.guessed_user_id)}</strong> — not this time.</>}
            </span>
          </div>
        ) : (
          <p style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 14px' }}>
            You didn't submit a guess for this film.
          </p>
        )}

        {/* Everyone's guesses */}
        {visibleGuesses.length === 0 ? (
          <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            No guesses were made for this film.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {visibleGuesses.map(g => {
              const correct = pickedByUserId && g.guessed_user_id === pickedByUserId
              const isMe = g.guessing_user_id === currentUserId
              return (
                <li
                  key={g.guessing_user_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: isMe ? 'rgba(var(--fg-rgb),0.05)' : 'transparent',
                    border: '1px solid rgba(var(--fg-rgb),0.08)',
                    borderRadius: '10px',
                    padding: '8px 10px',
                  }}
                >
                  <Avatar user={userMap.get(g.guessing_user_id) ?? { name: nameOf(g.guessing_user_id) }} size={26} />
                  <span style={{ fontFamily: SANS, fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)' }}>
                    {nameOf(g.guessing_user_id)}{isMe ? ' (you)' : ''}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: '10px', color: 'var(--text-faint)' }} aria-hidden="true">→</span>
                  <span style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text)' }}>
                    {nameOf(g.guessed_user_id)}
                  </span>
                  <span
                    aria-label={correct ? 'Correct guess' : 'Incorrect guess'}
                    style={{ marginLeft: 'auto', fontSize: '15px', lineHeight: 1, color: correct ? GREEN : RED }}
                  >
                    {correct ? '✓' : '✗'}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        {error && (
          <p style={{ fontFamily: SANS, fontSize: '12px', color: RED, margin: '12px 0 0' }}>{error}</p>
        )}
      </section>
    )
  }

  // ============================ PRE-REVEAL ============================
  // Guard: never offer the test account or yourself as a choice.
  const selectId = `gtp-select-${movieId || 'x'}`
  const savedName = myGuess && !isTest(myGuess) ? nameOf(myGuess) : null

  return (
    <section aria-label="Guess the picker" style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
        <Label>Guess the Picker</Label>
        {saving && (
          <span style={{ fontFamily: MONO, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)' }}>
            Saving…
          </span>
        )}
      </div>

      <p style={{ fontFamily: SANS, fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.4 }}>
        Who do you think picked this film? Hidden from everyone until the reveal.
      </p>

      {candidates.length === 0 ? (
        <p style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          No members available to guess.
        </p>
      ) : (
        <>
          <label htmlFor={selectId} style={{ display: 'block', marginBottom: '6px' }}>
            <Label>Your guess</Label>
          </label>
          <select
            id={selectId}
            value={myGuess && !isTest(myGuess) ? myGuess : ''}
            onChange={(e) => saveGuess(e.target.value)}
            disabled={saving}
            aria-label="Guess which member picked this film"
            style={{
              width: '100%',
              padding: '11px 12px',
              borderRadius: '12px',
              fontFamily: SANS,
              fontSize: '14px',
              color: 'var(--text-strong)',
              background: 'rgba(var(--fg-rgb),0.05)',
              border: '1px solid rgba(var(--fg-rgb),0.12)',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
              appearance: 'none',
            }}
          >
            <option value="" disabled>Select a member…</option>
            {candidates.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>

          {savedName && (
            <div
              role="status"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginTop: '12px',
                background: 'rgba(var(--fg-rgb),0.04)',
                border: '1px solid rgba(var(--fg-rgb),0.1)',
                borderRadius: '10px',
                padding: '9px 11px',
              }}
            >
              <Avatar user={userMap.get(myGuess) ?? { name: savedName }} size={26} />
              <span style={{ fontFamily: SANS, fontSize: '13px', color: 'var(--text)', lineHeight: 1.3 }}>
                Your guess: <strong style={{ color: 'var(--text-strong)' }}>{savedName}</strong>
              </span>
            </div>
          )}
        </>
      )}

      {error && (
        <p style={{ fontFamily: SANS, fontSize: '12px', color: RED, margin: '12px 0 0' }}>{error}</p>
      )}
    </section>
  )
}

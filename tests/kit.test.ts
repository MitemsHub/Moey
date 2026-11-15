import { describe, expect, it } from 'vitest'

import { __testing } from '../src/worker/routes/kit'

const { extractContact, unbackedFigures, systemFor } = __testing

describe('prompt branches', () => {
  it('still asks a job draft to read as an application with the CV attached', () => {
    const prompt = systemFor('individual')
    expect(prompt).toContain('application material for one specific posting')
    expect(prompt).toContain('says the CV and cover letter are attached')
    expect(prompt).not.toContain('business record')
  })

  it('asks a business draft for a pitch with no attachments', () => {
    const prompt = systemFor('business')
    expect(prompt).toContain('business record')
    expect(prompt).toContain('no attachments mentioned')
    expect(prompt).not.toContain('CV and cover letter are attached')
  })
})

describe('contact extraction', () => {
  it('finds an address the posting actually published', () => {
    const { emails } = extractContact('Send your CV to hiring@betterhealth.co.uk before Friday.')
    expect(emails).toEqual(['hiring@betterhealth.co.uk'])
  })

  it('never treats a file name as an address', () => {
    const { emails } = extractContact('Logo at hero@2x.png and mail jobs@acme.io')
    expect(emails).toEqual(['jobs@acme.io'])
  })

  it('drops no-reply addresses, because nothing can be sent to them', () => {
    const { emails } = extractContact('noreply@acme.io or careers@acme.io')
    expect(emails).toEqual(['careers@acme.io'])
  })

  it('reads a recorded phone number and rejects short digit runs', () => {
    const { phones } = extractContact('Phone recorded: +44 20 7946 0958. Ref 2024.')
    expect(phones).toEqual(['+44 20 7946 0958'])
  })

  it('returns nothing rather than guessing when the text has no contact', () => {
    expect(extractContact('A restaurant with no website recorded.')).toEqual({ emails: [], phones: [] })
  })
})

describe('figure guard', () => {
  const draft = {
    headline: 'Developer',
    summary: 'Reduced onboarding time by 40%.',
    skills: [] as string[],
    experience: [],
    projects: [],
    coverLetter: 'I shipped three products.',
    evidence: [],
    gaps: [] as string[],
    email: { subject: 'Application', body: '' },
  }

  it('flags a percentage the operator never supplied', () => {
    // Only digits are detected; a spelled-out number is a known gap in this guard.
    expect(unbackedFigures(draft, 'I built dashboards in react')).toEqual(['40%'])
  })

  it('accepts a figure that is present in the inputs', () => {
    expect(unbackedFigures({ ...draft, summary: 'Supported 40 users.' }, 'supported 40 users at acme')).toEqual([])
  })
})

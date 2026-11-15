import { useState } from 'react'

import { Badge, Button, Field, Input, PageHeader, Select, Skeleton, Textarea, useToast } from '../components/ui'
import { updateProfile, useApiMutation, useProfiles } from '../lib/api'
import type { Profile } from '../../shared/types'

const ELIGIBILITY_FIELDS: { key: string; label: string; hint: string; kind?: 'text' | 'number' | 'select'; options?: string[] }[] = [
  { key: 'basedIn', label: 'Based in', hint: 'Country or region you can legally work from.' },
  { key: 'rightToWork', label: 'Right to work', hint: 'Countries/regions where you can take paid work without sponsorship.' },
  { key: 'minimumAge', label: 'Age band', hint: 'Used only to gate what is lawfully applicable. Nothing is inferred.', kind: 'select', options: ['', 'under 18', '18 or over'] },
  { key: 'entityName', label: 'Registered entity', hint: 'Legal name of the business that would sign contracts and tenders.' },
  { key: 'taxId', label: 'Tax / registration id', hint: 'Needed for tenders and invoices. Leave blank until you have it.' },
  { key: 'insurance', label: 'Professional insurance', hint: 'Required by many tenders and larger clients.' },
]

function ProfileEditor({ profile }: { profile: Profile }) {
  const toast = useToast()
  const [skillText, setSkillText] = useState(profile.skills.join(', '))
  const [serviceText, setServiceText] = useState(profile.services.map((s) => s.service).join('\n'))
  const [headline, setHeadline] = useState(profile.headline ?? '')
  const [summary, setSummary] = useState(profile.summary ?? '')
  const [location, setLocation] = useState(profile.location ?? '')
  const [github, setGithub] = useState(profile.github ?? '')
  const [experience, setExperience] = useState(profile.experience ?? '')
  const [eligibility, setEligibility] = useState<Record<string, string>>(profile.eligibility ?? {})

  const save = useApiMutation(
    (id: string) =>
      updateProfile(id, {
        headline,
        summary,
        location,
        github,
        experience,
        eligibility,
        skills: skillText.split(',').map((s) => s.trim()).filter(Boolean),
        services: serviceText.split('\n').map((s) => s.trim()).filter(Boolean).map((service) => ({ service })),
      }),
    ['profiles', 'me', 'opportunities', 'overview'],
    { onSuccess: () => toast(`${profile.name} saved`) },
  )

  return (
    <section className="rounded-card border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-[13.5px] font-medium">{profile.name}</h2>
          <p className="text-[11.5px] text-faint">
            {profile.kind === 'business' ? 'Mitemshub business pipeline' : 'Individual pipeline'}
          </p>
        </div>
        <Badge tone={profile.filled ? 'success' : 'warning'} dot>
          {profile.filled ? 'Filled' : 'Empty — scores limited'}
        </Badge>
      </header>

      <div className="grid gap-3.5 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Headline" hint="One line describing the offer or the person.">
            <Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder={profile.kind === 'business' ? 'What Mitemshub builds' : 'What you do'} />
          </Field>
          <Field label="Location">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, country" />
          </Field>
        </div>

        <Field label="Summary" hint="Only real facts. This text is what the qualifier reads.">
          <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="Delivered work, domains, constraints." />
        </Field>

        <Field
          label="GitHub username"
          hint="Public repositories only. Used to evidence real projects in an application kit — nothing is ever posted."
        >
          <Input value={github} onChange={(e) => setGithub(e.target.value)} placeholder="octocat" autoComplete="off" />
        </Field>

        <Field
          label="Experience"
          hint="One line per role, in your own words: Role — Organisation — dates — what you delivered. Leave blank if you have none to state; a CV will not invent it."
        >
          <Textarea
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            rows={4}
            placeholder={'Frontend engineer — Acme — 2023 to now — built the billing dashboard in React'}
          />
        </Field>

        <Field
          label={profile.kind === 'business' ? 'Services' : 'Skills'}
          hint={
            profile.kind === 'business'
              ? 'One service per line. Scoring matches these against opportunity text.'
              : 'Comma separated. These are matched against the posting text, so use plain names (react, sql, data analysis).'
          }
        >
          {profile.kind === 'business' ? (
            <Textarea value={serviceText} onChange={(e) => setServiceText(e.target.value)} rows={4} placeholder={'web development\nai automation\ndata analysis'} />
          ) : (
            <Input value={skillText} onChange={(e) => setSkillText(e.target.value)} placeholder="typescript, react, sql, data analysis" />
          )}
        </Field>

        {profile.kind === 'individual' && (
          <Field label="Skills" hint="Comma separated — kept alongside services for matching.">
            <Input value={skillText} onChange={(e) => setSkillText(e.target.value)} placeholder="typescript, react, sql" />
          </Field>
        )}
        {profile.kind === 'business' && (
          <Field label="Capability keywords" hint="Comma separated. Matched against postings and tenders.">
            <Input value={skillText} onChange={(e) => setSkillText(e.target.value)} placeholder="typescript, react, sql, automation" />
          </Field>
        )}

        <div>
          <h3 className="text-[12px] font-medium">Eligibility</h3>
          <p className="mt-0.5 text-[11.5px] text-faint">
            Left blank on purpose. The engine will not assume any of these, and scores carry a warning until they are set.
          </p>
          <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
            {ELIGIBILITY_FIELDS.map((field) => (
              <Field key={field.key} label={field.label} hint={field.hint}>
                {field.kind === 'select' ? (
                  <Select
                    value={eligibility[field.key] ?? ''}
                    onChange={(e) => setEligibility({ ...eligibility, [field.key]: e.target.value })}
                  >
                    {field.options?.map((option) => (
                      <option key={option} value={option}>
                        {option || 'Not stated'}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={eligibility[field.key] ?? ''}
                    onChange={(e) => setEligibility({ ...eligibility, [field.key]: e.target.value })}
                    placeholder="Not stated"
                  />
                )}
              </Field>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="primary" onClick={() => save.mutate(profile.id)} loading={save.isPending}>
            Save profile
          </Button>
        </div>
      </div>
    </section>
  )
}

export function Profiles() {
  const { data, isLoading } = useProfiles()

  return (
    <div className="mx-auto max-w-[980px] px-5 py-5 sm:px-7">
      <PageHeader
        title="Profiles"
        subtitle="The two pipelines are matched against different records. Nothing is pre-filled — an invented skill would corrupt every score."
      />

      <div className="mt-5 flex flex-col gap-4">
        {isLoading
          ? [0, 1].map((i) => <Skeleton key={i} className="h-80" />)
          : (data?.items ?? []).map((profile) => <ProfileEditor key={profile.id} profile={profile} />)}
      </div>

      <p className="mt-5 max-w-[75ch] text-[12px] leading-relaxed text-faint">
        Matching today is skill overlap plus demand-language rules. If a model key is configured, rows that clear the rule
        gate get one model pass and the score records which one produced it. There is no vector search in this build.
      </p>
    </div>
  )
}

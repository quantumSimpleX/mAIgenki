import { redactPII } from '@/lib/privacy/redact'

describe('redactPII', () => {
  it('redacts an SSN', () => {
    expect(redactPII('SSN: 123-45-6789')).not.toContain('123-45-6789')
  })
  it('redacts a labeled phone number', () => {
    expect(redactPII('Phone: 555-867-5309')).not.toContain('555-867-5309')
  })
  it('redacts an email', () => {
    expect(redactPII('Contact: user@example.com')).not.toContain('user@example.com')
  })
  it('redacts a labeled patient name', () => {
    expect(redactPII('Patient name: John Smith')).not.toContain('John Smith')
  })
  it('preserves medical terms', () => {
    expect(redactPII('Diagnosis: Hypertension')).toContain('Hypertension')
  })
  it('preserves institution names', () => {
    expect(redactPII('Cleveland Clinic referral')).toContain('Cleveland Clinic')
  })
})

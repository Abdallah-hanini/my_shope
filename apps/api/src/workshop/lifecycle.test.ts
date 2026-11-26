import { allowedInStatus, availableActions, permits, statusAfterAssignment } from './lifecycle';

const manager = { manage: true, work: false, qc: false, onJob: false };
const tech = { manage: false, work: true, qc: false, onJob: true, onTask: true };
const inspector = { manage: false, work: false, qc: true, onJob: false };

describe('job lifecycle', () => {
  it('follows the SRS order; closed jobs accept nothing but notes', () => {
    expect(allowedInStatus('authorize', 'draft')).toBe(true);
    expect(allowedInStatus('start', 'approved')).toBe(false);
    expect(allowedInStatus('start', 'assigned')).toBe(true);
    expect(allowedInStatus('submitQc', 'rework')).toBe(true);
    expect(allowedInStatus('deliver', 'qc')).toBe(false);
    for (const s of ['delivered', 'cancelled'] as const) {
      expect(availableActions(s, manager)).toEqual(['note']);
      expect(allowedInStatus('removePhoto', s)).toBe(false);
    }
  });

  it('moves between approved and assigned as technicians are set or cleared', () => {
    expect(statusAfterAssignment('approved', true)).toBe('assigned');
    expect(statusAfterAssignment('assigned', false)).toBe('approved');
    expect(statusAfterAssignment('in_progress', false)).toBe('in_progress');
    expect(statusAfterAssignment('draft', true)).toBe('draft');
  });

  it('technicians work on their own jobs and tasks only', () => {
    expect(permits('start', tech)).toBe(true);
    expect(permits('start', { ...tech, onJob: false })).toBe(false);
    expect(permits('completeTask', { ...tech, onTask: false })).toBe(false);
    expect(permits('deliver', tech)).toBe(false);
    expect(permits('authorize', tech)).toBe(false);
  });

  it('quality check: inspectors only, never on a job they worked on', () => {
    expect(permits('qc', inspector)).toBe(true);
    expect(permits('qc', { ...inspector, onJob: true })).toBe(false);
    expect(permits('qc', manager)).toBe(false);
    expect(availableActions('qc', inspector)).toEqual(['qc', 'note']);
  });

  it('offers a manager every management action for the status', () => {
    expect(availableActions('draft', manager)).toEqual([
      'edit',
      'inspect',
      'authorize',
      'assign',
      'cancel',
      'promise',
      'note',
      'addPhoto',
      'removePhoto',
      'placeBay',
    ]);
    expect(availableActions('ready', manager)).toEqual([
      'deliver',
      'cancel',
      'promise',
      'note',
      'addPhoto',
      'placeBay',
    ]);
    expect(availableActions('delivered', manager)).not.toContain('placeBay');
    expect(permits('placeBay', { manage: false, work: true, qc: false, onJob: false })).toBe(false);
  });

  it('photos: technicians on the job may add them; only managers remove, and only in a draft', () => {
    expect(permits('addPhoto', tech)).toBe(true);
    expect(permits('addPhoto', { ...tech, onJob: false })).toBe(false);
    expect(permits('removePhoto', tech)).toBe(false);
    expect(allowedInStatus('removePhoto', 'approved')).toBe(false);
    expect(allowedInStatus('inspect', 'approved')).toBe(false);
  });

  it('the owner may quality-check work they did on the job (with a reason, checked by the service)', () => {
    expect(permits('qc', { manage: true, work: true, qc: true, onJob: true })).toBe(false);
    expect(permits('qc', { manage: true, work: true, qc: true, onJob: true, owner: true })).toBe(true);
    expect(permits('qc', { manage: true, work: true, qc: false, onJob: true, owner: true })).toBe(false);
  });
});

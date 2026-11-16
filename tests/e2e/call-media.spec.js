import { expect, test } from '@playwright/test';
import { installRandomChatHarness } from './harness';

for (const [mode, captures] of [['audio', 1], ['text', 0], ['video', 1]]) {
  test(`${mode} participation requests only its selected devices and ends cleanly`, async ({ page }) => {
    await installRandomChatHarness(page, { view: 'CallChat', media: { mode, allowedModes: ['video', 'audio', 'text'] } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/?view=CallChat');
    await expect(page.getByRole('button', { name: 'Join call', exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.__videowhisperE2E.captures || [])).toHaveLength(0);
    await page.getByRole('button', { name: 'Join call', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__videowhisperE2E.events.filter(e => e.event === 'roomJoin').length)).toBeGreaterThan(0);
    const constraints = await page.evaluate(() => window.__videowhisperE2E.captures || []);
    expect(constraints.length).toBeGreaterThanOrEqual(captures);
    if (mode === 'text') expect(constraints).toHaveLength(0);
    if (mode === 'audio') expect(constraints.every(c => c.video === false && c.audio.echoCancellation)).toBe(true);
    if (mode === 'video') expect(constraints.every(c => c.video && c.audio)).toBe(true);
    await page.evaluate(() => window.__videowhisperE2E.socket.trigger('roomUpdate', { room: 'E2ERoom', type: 'roomJoin', messages: [{ id: 'history-1', user: 'TextGuest', text: 'Synthetic earlier message' }], participants: { self: { name: 'E2EUser' }, other: { name: 'TextGuest', mic: false, camera: false } } }));
    await expect(page.getByText('The other participant is connected. Media may be off; use the conversation below.')).toBeVisible();
    await expect(page.getByText('Synthetic earlier message', { exact: false })).toBeVisible();
    await expect(page.getByTitle('Rotate camera')).toHaveCount(mode === 'video' ? 1 : 0);
    await page.getByRole('button', { name: 'End call', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Call ended' })).toBeVisible();
    expect(await page.evaluate(() => window.__videowhisperE2E.events.some(e => e.event === 'roomLeave'))).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('a microphone permission failure retains retry and end controls', async ({ page }) => {
  await installRandomChatHarness(page, { view: 'CallChat', media: { mode: 'audio' } });
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Microphone denied', 'NotAllowedError'); }; });
  await page.goto('/?view=CallChat');
  await page.getByRole('button', { name: 'Join call', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Microphone denied');
  await expect(page.getByRole('button', { name: 'Retry microphone/camera' })).toBeVisible();
  await page.getByRole('button', { name: 'End call', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Call ended' })).toBeVisible();
});

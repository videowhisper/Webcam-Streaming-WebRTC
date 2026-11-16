import { expect, test } from '@playwright/test';

import { installRandomChatHarness } from './harness';

async function openRandomChat(page) {
  await installRandomChatHarness(page);
  await page.goto('/?view=RandomChat');
  await expect(page.getByRole('heading', { name: 'Random Chat' })).toBeVisible();
  await expect.poll(
    () => page.evaluate(() => window.__videowhisperE2E.events.some((entry) => entry.event === 'randomQueueJoin')),
    { message: 'RandomChat should queue after the socket connects' },
  ).toBe(true);
}

test('shows initial random chat filters and queues from public config', async ({ page }) => {
  await openRandomChat(page);

  await expect(page.getByText('Waiting for a compatible participant')).toBeVisible();
  await expect(page.getByLabel('Topic')).toBeVisible();
  await expect(page.getByLabel('Language')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply Filters' })).toBeVisible();
  await expect(page.getByTitle('Copy invite link')).toHaveCount(0);
});

test('active match can reopen filters and request the next match with updated filters', async ({ page }) => {
  await openRandomChat(page);

  await page.evaluate(() => {
    window.__videowhisperE2E.socket.trigger('matchFound', {
      queue: 'e2e',
      room: 'CallE2EActive',
      peer: { user: 'PeerE2E' },
      roomOptions: { maxParticipants: 2, privateRoom: true },
    });
  });

  await expect(page.getByTitle('Show filters')).toBeVisible();
  await expect(page.getByTitle('Copy invite link')).toHaveCount(0);
  await expect(page.getByText('Room CallE2EActive')).toHaveCount(0);

  await page.getByTitle('Show filters').click();
  await expect(page.getByRole('heading', { name: 'Match Filters' })).toBeVisible();
  await page.getByLabel('Topic').selectOption('Sales');
  await page.getByRole('button', { name: 'Apply Filters and Find Next' }).click();

  await expect.poll(
    () => page.evaluate(() => window.__videowhisperE2E.events.some((entry) => entry.event === 'roomLeave' && entry.payload?.room === 'CallE2EActive')),
    { message: 'Applying active filters should leave the current random room' },
  ).toBe(true);

  await expect.poll(
    () => page.evaluate(() => {
      const joins = window.__videowhisperE2E.events.filter((entry) => entry.event === 'randomQueueJoin');
      return joins.some((entry) => entry.payload?.filters?.topic === 'Sales');
    }),
    { message: 'Applying active filters should enqueue with the changed filters' },
  ).toBe(true);
});

test('media control icons remain visible in light and dark system themes', async ({ page }) => {
  await openRandomChat(page);
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    const button = page.getByTitle('Mute microphone');
    await expect(button).toBeVisible();
    await expect(button.locator('svg')).toBeVisible();
    const colors = await button.evaluate(element => {
      const style = getComputedStyle(element);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d');
      context.fillStyle = style.backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return { background: [...context.getImageData(0, 0, 1, 1).data], stroke: getComputedStyle(element.querySelector('svg')).stroke };
    });
    // White icons require a translucent control surface, rather than the opaque
    // white Vite starter button that used to override the app's utility class.
    expect(colors.background[3]).toBeLessThan(100);
    expect(colors.stroke).toBe('rgb(255, 255, 255)');
  }
});

test('renews a session PIN and rejects a different account response', async ({ page }) => {
  await installRandomChatHarness(page);
  await page.addInitScript(() => {
    window.videowhisperConfig.videowhisperServer = {
      socket: 'http://127.0.0.1:8094', authentication: 'pin', account: 'local_test',
      user: 'E2EUser', pin: 'initial-local-pin', credentialsURL: './session-credentials',
    };
  });
  let renewals = 0;
  await page.route('**/session-credentials', route => {
    renewals++;
    return route.fulfill({ json: { vwsAuth: { account: renewals < 3 ? 'local_test' : 'another_account', pin: 'renewed-' + renewals } } });
  });
  await page.goto('/?view=RandomChat');
  await expect(page.getByRole('heading', { name: 'Random Chat' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => typeof window.__videowhisperE2E.socket?.auth)).toBe('function');
  const renew = () => page.evaluate(() => new Promise(resolve => window.__videowhisperE2E.socket.auth(resolve)));
  expect(await renew()).toEqual({ account: 'local_test', user: 'E2EUser', pin: 'renewed-1' });
  expect(await renew()).toEqual({ account: 'local_test', user: 'E2EUser', pin: 'renewed-2' });
  expect(await renew()).toEqual({});
  await expect(page.getByText('Session authentication failed. Reload the page and try again.')).toBeVisible();
});

test('broadcaster sharing icons retain a white foreground in the light theme', async ({ page }) => {
  await installRandomChatHarness(page);
  await page.addInitScript(() => { window.videowhisperConfig.view = 'BroadcastChat'; });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/?view=BroadcastChat');
  const icon = page.getByTitle('Copy Stream URL').locator('svg');
  await expect(icon).toBeVisible();
  await expect(icon).toHaveCSS('stroke', 'rgb(255, 255, 255)');
});

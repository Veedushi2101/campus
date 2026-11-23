import {expect, test} from '@playwright/test';

test.describe('CampusVerse End-to-End Workflows', () => {
  test('Student follows two clubs, third follow is rejected, and views QR registration pass', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByRole('button', {name: /Aarav Mehta/i}).click();
    await expect(page).toHaveURL(/\/app\/student\/dashboard/);
    await expect(page.getByText('1 / 2')).toBeVisible();

    // Go to Explore Clubs
    await page.getByRole('link', {name: 'Explore Clubs'}).first().click();
    await expect(page).toHaveURL(/\/app\/student\/clubs/);

    // Follow 2nd club
    const followButtons = page.getByRole('button', {name: 'Follow Club'});
    await followButtons.first().click();
    await expect(page.getByText(/Two-Club Follow Limit Reached/i)).toBeVisible();

    // Try following a 3rd club -> rejected cleanly with explanation
    await page.getByRole('button', {name: /Limit Reached/i}).first().click();
    await expect(page.getByText(/Follow limit reached/i)).toBeVisible();

    // Open My Registrations and view QR pass
    await page.getByRole('link', {name: 'My Registrations'}).click();
    await expect(page).toHaveURL(/\/app\/student\/registrations/);
    await page.getByRole('button', {name: /Open QR Pass/i}).first().click();
    await expect(page.getByText(/Single-use opaque attendance token/i)).toBeVisible();
  });

  test('Club Admin creates, publishes event, scans attendance, and submits report', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByRole('button', {name: /Priya Nair/i}).click();
    await expect(page).toHaveURL(/\/app\/club-admin\/dashboard/);

    // Navigate to Club Events and create draft
    await page.getByRole('link', {name: 'Events', exact: true}).click();
    await page.getByRole('button', {name: /Create Event/i}).click();
    await page.getByLabel('Event Title').fill('Spring Telemetry Lab');
    await page.getByLabel('Venue').fill('Hangar C3');
    await page
      .getByLabel('Event Description')
      .fill('Hands-on telemetry logging and microcontroller debugging workshop.');
    await page.getByRole('button', {name: /Create Draft Event/i}).click();
    await expect(page.getByText('Spring Telemetry Lab')).toBeVisible();

    // Publish event
    await page.getByRole('button', {name: 'Publish'}).first().click();
    await expect(page.getByText('Event published')).toBeVisible();

    // Attendance QR simulation
    await page.getByRole('link', {name: /Attendance & QR/i}).click();
    await page.getByRole('button', {name: /Simulate Scan/i}).first().click();
    await expect(page.getByText(/Checked in/i).first()).toBeVisible();

    // Submit event report
    await page.getByRole('link', {name: /Reports & Finance/i}).click();
    await page
      .getByLabel('Outcome Summary')
      .fill('Successfully completed robotics buildathon with high turnout across cohorts.');
    await page.getByLabel('Key Highlights').fill('All 12 teams completed autonomous runs.');
    await page.getByRole('button', {name: /Submit Event Report|Update Event Report/i}).click();
    await expect(page.getByText('Event report submitted')).toBeVisible();
  });

  test('Core Member sees only permission-scoped navigation and Super Admin accesses oversight', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByRole('button', {name: /Rohan Verma/i}).click();
    await expect(page).toHaveURL(/\/app\/core\/dashboard/);
    await expect(page.getByText(/Assigned Club Permissions/i)).toBeVisible();
    // Core Member without MANAGE_FORMS should not see Form Builder nav link
    await expect(page.getByRole('link', {name: 'Form Builder'})).toHaveCount(0);

    // Switch to Super Admin
    await page.goto('/login');
    await page.getByRole('button', {name: /Dr\. Elena Vance/i}).click();
    await expect(page).toHaveURL(/\/app\/admin\/dashboard/);
    await page.getByRole('link', {name: 'Audit Logs'}).first().click();
    await expect(page).toHaveURL(/\/app\/admin\/audit-logs/);
    await expect(page.getByText('APPROVED_CLUB_CHARTER')).toBeVisible();
  });
});

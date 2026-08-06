// The exemplar's locked flow: dev-login → seeded list → create → complete.
// Role/name locators only (gated). This is the pattern every ported flow
// test follows.
import { expect, test } from '../helpers'

test('notes: sign in, create, complete', async ({ page }) => {
	await page.goto(`/login/dev?as=${crypto.randomUUID()}`) // fresh owner: isolation, not resets
	await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible()
	await expect(page.getByText('Read the walking skeleton')).toBeVisible()

	await page.getByLabel('New note title').fill('Ship the skeleton')
	await page.getByRole('button', { name: 'Add' }).click()
	await expect(page.getByText('Ship the skeleton')).toBeVisible()

	await page.getByRole('button', { name: 'Complete Ship the skeleton' }).click()
	await expect(page.getByRole('button', { name: 'Complete Ship the skeleton' })).toBeHidden()

	await page.getByRole('button', { name: 'Hide done' }).click()
	await expect(page.getByText('Ship the skeleton')).toBeHidden()
})

test('expected error: a bad note ref renders the screen boundary inline', async ({ page }) => {
	await page.goto('/login/dev')
	await page.goto('/notes/does-not-exist')
	await expect(page.getByRole('alert')).toContainText('404')
})

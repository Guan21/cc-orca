import { expect, test } from './helpers/orca-app'

test('Review Queue opens as a dedicated DevCrew surface and Project Pulse still opens', async ({
  orcaPage
}) => {
  const reviewQueueButton = orcaPage.getByRole('button', { name: 'Review Queue' })
  const projectPulseButton = orcaPage.getByRole('button', { name: 'Project Pulse' })

  await expect(projectPulseButton).toBeVisible()
  await expect(reviewQueueButton).toBeVisible()

  await reviewQueueButton.click()
  await expect(orcaPage.getByRole('heading', { name: 'DevCrew Review Queue' })).toBeVisible()
  await orcaPage.getByRole('button', { name: /Build Review Queue foundation/ }).click()
  await expect(orcaPage.locator('[data-review-queue-detail]')).toContainText('FAILED')
  await expect(orcaPage.getByText('Tests failed').first()).toBeVisible()
  await expect(orcaPage.getByText('Security-sensitive area changed').first()).toBeVisible()
  await expect(orcaPage.getByText('Related events')).toBeVisible()

  await orcaPage.getByRole('button', { name: /Polish Project Pulse summaries/ }).click()
  await expect(orcaPage.locator('[data-review-queue-detail]')).toContainText(
    'Polish Project Pulse summaries'
  )
  await expect(orcaPage.locator('[data-review-queue-detail]')).toContainText(
    'Review requested but not completed'
  )

  await expect
    .poll(() => orcaPage.evaluate(() => window.__store?.getState().activeView))
    .toBe('review')

  await orcaPage.getByRole('button', { name: 'Close DevCrew Review Queue' }).click()
  await expect(reviewQueueButton).toBeVisible()
  await projectPulseButton.click()
  await expect(orcaPage.getByRole('heading', { name: 'DevCrew Project Pulse' })).toBeVisible()
  await expect
    .poll(() => orcaPage.evaluate(() => window.__store?.getState().activeView))
    .toBe('activity')
})

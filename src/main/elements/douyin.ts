import { Page, ElementHandle } from '@playwright/test'

export class DouyinElementSelector {
  private page?: Page

  setPage(page: Page): void {
    this.page = page
  }

  get activeVideoSelector(): string {
    return '[data-e2e="feed-active-video"]'
  }

  get videoIdAttribute(): string {
    return 'data-e2e-vid'
  }

  get commentInputContainerSelector(): string {
    return '.comment-input-inner-container'
  }

  get commentSubmitSelector(): string {
    return ''
  }

  get commentImageUploadSelector(): string {
    return '.commentInput-right-ct > div > span:nth-child(2)'
  }

  get likeButtonSelector(): string {
    return '[data-e2e="feed-like-icon"]'
  }

  get collectButtonSelector(): string {
    return '[data-e2e="feed-collect-icon"]'
  }

  get followButtonSelector(): string {
    return '[data-e2e="follow-button"]'
  }

  get commentIconSelector(): string {
    return '[data-e2e="feed-comment-icon"]'
  }

  get verifyDialogSelector(): string {
    return '.second-verify-panel'
  }

  get loginPanelSelector(): string {
    return '#login-panel-new'
  }

  get videoSideCardSelector(): string {
    return '#videoSideCard'
  }

  async isCommentSectionOpen(): Promise<boolean> {
    if (!this.page) return false
    const videoSideCard = await this.page.$(this.videoSideCardSelector)
    if (!videoSideCard) return false
    const clientWidth = await videoSideCard.evaluate((el) => (el as HTMLElement).clientWidth)
    return clientWidth > 0
  }

  async goToNextVideo(): Promise<void> {
    if (!this.page) return

    if (await this.isCommentSectionOpen()) {
      await this.closeCommentSection()
      await this.page.waitForTimeout(500)
    }

    await this.page.keyboard.press('ArrowDown')
    await this.page.waitForSelector(this.activeVideoSelector, {
      state: 'visible',
      timeout: 5000
    }).catch(() => null)
  }

  async openCommentSection(): Promise<void> {
    if (!this.page) return
    await this.page.keyboard.press('x')
    await this.page.waitForTimeout(300)
  }

  async closeCommentSection(): Promise<void> {
    if (!this.page) return
    await this.page.keyboard.press('x')
    await this.page.waitForTimeout(300)
  }

  async like(): Promise<void> {
    if (!this.page) return
    await this.page.keyboard.press('z')
    await this.page.waitForTimeout(200)
  }

  async getActiveVideoElement(): Promise<{ element: ElementHandle | null; videoId: string | null } | null> {
    if (!this.page) return null
    const element = await this.page.$(this.activeVideoSelector)
    if (!element) return null
    const videoId = await element.getAttribute(this.videoIdAttribute)
    return { element, videoId }
  }
}
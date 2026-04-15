import type { Platform } from '../../shared/platform'
import { BasePlatformAdapter } from './base'
import { DouyinPlatformAdapter } from './douyin'
import { KuaishouPlatformAdapter } from './kuaishou'
import { XiaohongshuPlatformAdapter } from './xiaohongshu'

export function createPlatformAdapter(platform: Platform): BasePlatformAdapter {
  switch (platform) {
    case 'douyin':
      return new DouyinPlatformAdapter()
    case 'kuaishou':
      return new KuaishouPlatformAdapter()
    case 'xiaohongshu':
      return new XiaohongshuPlatformAdapter()
    default:
      throw new Error(`不支持的平台: ${platform}`)
  }
}

export function isPlatformSupported(platform: Platform): boolean {
  return ['douyin', 'kuaishou', 'xiaohongshu'].includes(platform)
}

export function getSupportedPlatforms(): Platform[] {
  return ['douyin', 'kuaishou', 'xiaohongshu']
}

export { BasePlatformAdapter }
export { DouyinPlatformAdapter } from './douyin'
export { KuaishouPlatformAdapter } from './kuaishou'
export { XiaohongshuPlatformAdapter } from './xiaohongshu'

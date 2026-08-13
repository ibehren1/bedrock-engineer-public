import { getModelsForRegion } from '../../../../common/models/models'
import type { ServiceContext, AWSCredentials } from '../types'
import { BedrockSupportRegion } from '../../../../types/llm'

export class ModelService {
  constructor(private context: ServiceContext) {}

  async listModels() {
    const awsCredentials = this.context.store.get('aws') as AWSCredentials
    const { region, accessKeyId, useProfile } = awsCredentials

    // AWS認証情報のバリデーション
    if (!region || (!useProfile && !accessKeyId)) {
      console.warn('AWS credentials not configured properly')
      return []
    }

    try {
      return getModelsForRegion(region as BedrockSupportRegion)
    } catch (error) {
      console.error('Error in listModels:', error)
      return []
    }
  }
}

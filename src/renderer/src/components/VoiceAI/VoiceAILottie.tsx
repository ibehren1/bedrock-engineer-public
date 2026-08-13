import Lottie, { LottieComponentProps } from 'lottie-react'
import data from '../../assets/lottie/loading-voice-with-ai.json'

// ignore type animationData from LottieComponentProps
type VoiceAILottieProps = Omit<LottieComponentProps, 'animationData'> & {
  // 音声切り替え時のアニメーション再実行のためのキー
  voiceKey?: string | number
}

const VoiceAILottie = ({ voiceKey, ...props }: VoiceAILottieProps) => {
  return (
    <Lottie
      {...props}
      key={voiceKey} // 音声変更時にアニメーションを再実行
      animationData={data}
      loop={true}
      autoplay={true}
    />
  )
}

export default VoiceAILottie

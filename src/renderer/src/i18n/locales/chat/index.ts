import { agent } from './agent'
import { examples } from './examples'
import { messages } from './messages'
import { history } from './history'
import { tools } from './tools'
import { guardrails } from './guardrails'

export const chatPage = {
  en: {
    ...agent.en,
    ...examples.en,
    ...messages.en,
    ...history.en,
    ...tools.en,
    ...guardrails.en,
    ...{
      'Analyzed image': 'Analyzed image',
      'Image Analysis': 'Image Analysis',
      'Analyzed with': 'Analyzed with',
      'Image Recognition Settings': 'Image Recognition Settings',
      'Select which model to use for image recognition tasks':
        'Select which model to use for image recognition tasks',
      'Recognition Model': 'Recognition Model',
      'Only Claude models with vision capabilities are supported':
        'Only Claude models with vision capabilities are supported',
      'About Image Recognition': 'About Image Recognition',
      "Image recognition uses Claude's vision capabilities to analyze and describe images. The selected model will be used when you run the recognizeImage tool.":
        "Image recognition uses Claude's vision capabilities to analyze and describe images. The selected model will be used when you run the recognizeImage tool.",
      textarea: {
        placeholder: 'Type message or add images ({{modifier}}+V / drop)',
        imageValidation: {
          tooLarge: 'Image is too large (max: 3.75MB)',
          dimensionTooLarge: 'Image dimensions are too large (max: 8000px)',
          tooManyImages: 'Maximum 20 images allowed',
          unsupportedFormat: 'Unsupported image format: {{format}}'
        },
        document: {
          extracting: 'Saving and reading {{name}}...',
          extracted: 'Added contents of {{name}}',
          extractFailed: 'Could not read {{name}}: {{error}}',
          injectedBlock:
            '\n\n--- Document: {{name}} (saved to {{path}}) ---\n{{content}}\n--- End of {{name}} ---\n'
        },
        aria: {
          removeImage: 'Remove image',
          sendMessage: 'Send message',
          sending: 'Sending...'
        },
        mention: {
          ariaLabel: 'Agents you can delegate to'
        }
      },
      delegation: {
        toolDisabled:
          'You mentioned an agent, but "{{agent}}" does not have the invokeAgent tool enabled, so it cannot delegate.',
        unavailableInPlanMode:
          'Delegation is unavailable in Plan mode. Switch to Act mode to use it.'
      },
      invokeAgentResult: {
        depth: 'depth {{depth}}',
        truncated: "The sub-agent's answer was truncated because it was very long.",
        toolBudgetReached:
          'The sub-agent stopped after reaching its tool-call budget, so this answer may be incomplete.',
        toolCalls: '{{count}} tool call',
        toolCalls_plural: '{{count}} tool calls',
        tokens: '{{count}} tokens'
      },
      ignoreFiles: {
        title: 'Ignore Files',
        description:
          'The files and folders listed below will not be read by various tools. Enter each file and folder on a new line.',
        placeholder: 'or other files...',
        save: 'Save'
      },
      confirmClearChat: 'Are you sure you want to start a new chat?',
      'Export chat to Markdown': 'Export chat to Markdown',
      'Export chat to Word': 'Export chat to Word',
      'Export chat to PDF': 'Export chat to PDF',
      'Exporting chat...': 'Exporting chat...',
      'Chat exported to': 'Chat exported to',
      'Failed to export chat': 'Failed to export chat',
      attachments: {
        label: 'Attachments',
        tooltip: 'Open the attachments folder',
        openFailed: 'Could not open attachments folder: {{error}}'
      }
    }
  },
  ja: {
    ...agent.ja,
    ...examples.ja,
    ...messages.ja,
    ...history.ja,
    ...tools.ja,
    ...guardrails.ja,
    ...{
      'Analyzed image': '解析された画像',
      'Image Analysis': '画像解析結果',
      'Analyzed with': '使用モデル',
      'Image Recognition Settings': '画像認識設定',
      'Select which model to use for image recognition tasks':
        '画像認識タスクに使用するモデルを選択してください',
      'Recognition Model': '認識モデル',
      'Only Claude models with vision capabilities are supported':
        'ビジョン機能を持つClaudeモデルのみがサポートされています',
      'About Image Recognition': '画像認識について',
      "Image recognition uses Claude's vision capabilities to analyze and describe images. The selected model will be used when you run the recognizeImage tool.":
        '画像認識はClaudeのビジョン機能を使用して画像を分析・説明します。選択したモデルはrecognizeImageツールを実行する際に使用されます。',
      textarea: {
        placeholder: 'メッセージを入力、または画像を追加 ({{modifier}}+V / ドロップ)',
        imageValidation: {
          tooLarge: '画像が大きすぎます (上限: 3.75MB)',
          dimensionTooLarge: '画像サイズが大きすぎます (上限: 8000px)',
          tooManyImages: '画像は最大20枚までです',
          unsupportedFormat: '未対応の画像形式です: {{format}}'
        },
        document: {
          extracting: '{{name}} を保存して読み込み中...',
          extracted: '{{name}} の内容を追加しました',
          extractFailed: '{{name}} を読み込めませんでした: {{error}}',
          injectedBlock:
            '\n\n--- ドキュメント: {{name}} (保存先: {{path}}) ---\n{{content}}\n--- {{name}} ここまで ---\n'
        },
        aria: {
          removeImage: '画像を削除',
          sendMessage: 'メッセージを送信',
          sending: '送信中...'
        },
        mention: {
          ariaLabel: '委譲できるエージェント'
        }
      },
      delegation: {
        toolDisabled:
          'エージェントをメンションしましたが、「{{agent}}」では invokeAgent ツールが有効になっていないため委譲できません。',
        unavailableInPlanMode:
          'Plan モードでは委譲を利用できません。Act モードに切り替えてください。'
      },
      invokeAgentResult: {
        depth: '深さ {{depth}}',
        truncated: 'サブエージェントの回答が長いため省略されました。',
        toolBudgetReached:
          'サブエージェントがツール実行上限に達して停止したため、この回答は不完全な可能性があります。',
        toolCalls: 'ツール実行 {{count}} 回',
        tokens: '{{count}} トークン'
      },
      ignoreFiles: {
        title: '無視ファイル設定',
        description:
          '以下に記載されたファイルやフォルダは、各種ツールによる読み込みから除外されます。各ファイルやフォルダを1行ずつ入力してください。',
        placeholder: 'その他のファイル...',
        save: '保存'
      },
      confirmClearChat: '新しいチャットを開始してもよろしいですか？',
      'Export chat to Markdown': 'Markdownにエクスポート',
      'Export chat to Word': 'Wordにエクスポート',
      'Export chat to PDF': 'PDFにエクスポート',
      'Exporting chat...': 'チャットをエクスポート中...',
      'Chat exported to': 'チャットのエクスポート先',
      'Failed to export chat': 'チャットのエクスポートに失敗しました',
      attachments: {
        label: '添付ファイル',
        tooltip: '添付ファイルフォルダを開く',
        openFailed: '添付ファイルフォルダを開けませんでした: {{error}}'
      }
    }
  }
}

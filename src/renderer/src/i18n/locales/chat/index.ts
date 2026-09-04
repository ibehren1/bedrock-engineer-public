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
        placeholder: 'Type message or attach files ({{modifier}}+V / drop)',
        imageValidation: {
          tooLarge: 'Image is too large (max: 3.75MB)',
          dimensionTooLarge: 'Image dimensions are too large (max: 8000px)',
          tooManyImages: 'Maximum 20 images allowed',
          unsupportedFormat: 'Unsupported image format: {{format}}'
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
        menu: {
          title: 'Attachments',
          empty: 'No files attached to this chat yet.',
          summary: '{{count}} file · {{size}}',
          summary_plural: '{{count}} files · {{size}}',
          addFiles: 'Add files…',
          openFolder: 'Open attachments folder',
          remove: 'Remove {{name}}'
        },
        toast: {
          added: 'Attached {{name}}',
          addedMany: 'Attached {{count}} files',
          removed: 'Removed {{name}}',
          addFailed: 'Could not attach {{name}}: {{error}}',
          removeFailed: 'Could not remove {{name}}: {{error}}',
          noSession: 'Starting the chat — try attaching again in a moment.',
          truncated:
            'Some attachments were too long to send in full: {{files}}. The agent can read the rest with its file tools.',
          skipped: 'Attachment not sent — {{name}}: {{reason}}',
          contextFailed: "Could not read this chat's attachments: {{error}}"
        },
        openFailed: 'Could not open attachments folder: {{error}}'
      },
      dockerSandbox: {
        menu: {
          title: 'Docker sandbox',
          stateRunning: 'running',
          statePartial: 'partly running',
          stateStopped: 'stopped',
          ports: 'Ports',
          openFolder: 'Open sandbox folder',
          start: 'Start containers',
          stop: 'Stop containers',
          remove: 'Remove sandbox (keep data)',
          removeWithData: 'Remove sandbox and delete data',
          confirmRemove:
            "Remove this chat's sandbox? Containers will be deleted and installed packages lost. The data folder stays on disk.",
          confirmRemoveWithData:
            "Remove this chat's sandbox and delete its data folder? Anything the agent wrote there will be gone. This cannot be undone."
        },
        toast: {
          started: 'Sandbox started',
          stopped: 'Sandbox stopped',
          removed: 'Sandbox removed. Data folder kept.',
          removedWithData: 'Sandbox and its data folder removed.'
        },
        settings: {
          intro:
            'Gives each chat its own Docker container based on ubuntu:26.04. Commands run inside it by default, so the agent can install anything without touching your machine.',
          timeoutHint:
            'How long to wait for a command before returning control to the model. The process keeps running past this; long builds are not killed.',
          limitsHint:
            'Applied to every service in every sandbox. Existing sandboxes pick up new limits when they are recreated.',
          behaviorPerChat: 'One sandbox per chat, created the first time the agent runs a command.',
          behaviorWorkspace:
            'Your project directory is mounted read-write at /workspace, so files move in and out freely.',
          behaviorHost:
            "Commands aimed at your own machine need your approval each time, and still honor the agent's allowed-command list.",
          behaviorLifecycle:
            'Sandboxes survive switching chats and are stopped when the app quits, then restart with packages intact.',
          behaviorFiles:
            'Compose and data files live under docker-sandboxes/ in your project directory, using mapped folders rather than named volumes.'
        }
      },
      hostCommand: {
        title: 'Run on your machine?',
        body: "The agent wants to run this command on your own machine instead of in the chat's Docker sandbox.",
        workingDirectory: 'Working directory',
        note: 'Allowing for this chat suppresses further prompts until you leave the chat. It is not saved to settings.',
        deny: 'Deny',
        allowOnce: 'Allow once',
        allowForChat: 'Allow for this chat'
      },
      deleteChat: {
        title: 'Delete chat',
        confirmSingle: 'Delete this chat? This cannot be undone.',
        confirmSelected: 'Delete {{count}} selected chat(s)? This cannot be undone.',
        confirmAll: 'Delete all chats? This cannot be undone.',
        sandboxNotice:
          'This chat has a Docker sandbox. Its containers will be stopped and removed.',
        deleteSandboxData: 'Also delete the sandbox data folder',
        deleteSandboxDataHint:
          'Removes everything the agent wrote inside the sandbox. Leave unchecked to keep those files on disk.',
        cancel: 'Cancel',
        delete: 'Delete'
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
        placeholder: 'メッセージを入力、またはファイルを添付 ({{modifier}}+V / ドロップ)',
        imageValidation: {
          tooLarge: '画像が大きすぎます (上限: 3.75MB)',
          dimensionTooLarge: '画像サイズが大きすぎます (上限: 8000px)',
          tooManyImages: '画像は最大20枚までです',
          unsupportedFormat: '未対応の画像形式です: {{format}}'
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
        menu: {
          title: '添付ファイル',
          empty: 'このチャットにはまだファイルが添付されていません。',
          summary: '{{count}} 件 · {{size}}',
          summary_plural: '{{count}} 件 · {{size}}',
          addFiles: 'ファイルを追加…',
          openFolder: '添付ファイルフォルダを開く',
          remove: '{{name}} を削除'
        },
        toast: {
          added: '{{name}} を添付しました',
          addedMany: '{{count}} 件のファイルを添付しました',
          removed: '{{name}} を削除しました',
          addFailed: '{{name}} を添付できませんでした: {{error}}',
          removeFailed: '{{name}} を削除できませんでした: {{error}}',
          noSession: 'チャットの準備中です。少し待ってからもう一度添付してください。',
          truncated:
            '一部の添付ファイルは長すぎるため全文を送信できませんでした: {{files}}。残りはエージェントがファイルツールで読めます。',
          skipped: '添付ファイルを送信できませんでした — {{name}}: {{reason}}',
          contextFailed: 'このチャットの添付ファイルを読み込めませんでした: {{error}}'
        },
        openFailed: '添付ファイルフォルダを開けませんでした: {{error}}'
      },
      dockerSandbox: {
        menu: {
          title: 'Docker サンドボックス',
          stateRunning: '実行中',
          statePartial: '一部実行中',
          stateStopped: '停止中',
          ports: 'ポート',
          openFolder: 'サンドボックスフォルダを開く',
          start: 'コンテナを起動',
          stop: 'コンテナを停止',
          remove: 'サンドボックスを削除（データは保持）',
          removeWithData: 'サンドボックスとデータを削除',
          confirmRemove:
            'このチャットのサンドボックスを削除しますか？コンテナは削除され、インストール済みパッケージは失われます。データフォルダはディスク上に残ります。',
          confirmRemoveWithData:
            'このチャットのサンドボックスとデータフォルダを削除しますか？エージェントが書き込んだ内容はすべて失われます。この操作は取り消せません。'
        },
        toast: {
          started: 'サンドボックスを起動しました',
          stopped: 'サンドボックスを停止しました',
          removed: 'サンドボックスを削除しました（データフォルダは保持）',
          removedWithData: 'サンドボックスとデータフォルダを削除しました'
        },
        settings: {
          intro:
            'チャットごとに ubuntu:26.04 ベースの Docker コンテナを用意します。コマンドは既定でその中で実行されるため、ホストに触れずに任意のパッケージをインストールできます。',
          timeoutHint:
            'モデルに制御を返すまでの待機時間です。プロセス自体はこの時間を超えても動き続けるため、長いビルドが強制終了されることはありません。',
          limitsHint:
            'すべてのサンドボックスの全サービスに適用されます。既存のサンドボックスには再作成時に反映されます。',
          behaviorPerChat:
            'チャットごとに 1 つ。エージェントが最初にコマンドを実行した時点で作成されます。',
          behaviorWorkspace:
            'プロジェクトディレクトリは /workspace に読み書き可能でマウントされ、ファイルを自由に出し入れできます。',
          behaviorHost:
            'ホスト側で実行するコマンドは毎回ユーザーの承認が必要で、エージェントの許可コマンド一覧も引き続き適用されます。',
          behaviorLifecycle:
            'チャットを切り替えても維持され、アプリ終了時に停止します。次回利用時はパッケージを保ったまま再起動します。',
          behaviorFiles:
            'compose とデータのファイルはプロジェクト内の docker-sandboxes/ 配下に置かれ、名前付きボリュームではなくマップされたフォルダを使用します。'
        }
      },
      hostCommand: {
        title: 'ホストで実行しますか？',
        body: 'エージェントがこのコマンドを、チャットの Docker サンドボックスではなくお使いのマシン上で実行しようとしています。',
        workingDirectory: '作業ディレクトリ',
        note: '「このチャットで許可」を選ぶと、チャットを離れるまで確認が表示されません。設定には保存されません。',
        deny: '拒否',
        allowOnce: '1 回だけ許可',
        allowForChat: 'このチャットで許可'
      },
      deleteChat: {
        title: 'チャットを削除',
        confirmSingle: 'このチャットを削除しますか？この操作は取り消せません。',
        confirmSelected:
          '選択した {{count}} 件のチャットを削除しますか？この操作は取り消せません。',
        confirmAll: 'すべてのチャットを削除しますか？この操作は取り消せません。',
        sandboxNotice:
          'このチャットには Docker サンドボックスがあります。コンテナは停止・削除されます。',
        deleteSandboxData: 'サンドボックスのデータフォルダも削除する',
        deleteSandboxDataHint:
          'サンドボックス内でエージェントが書き込んだ内容をすべて削除します。チェックしなければディスク上に残ります。',
        cancel: 'キャンセル',
        delete: '削除'
      }
    }
  }
}

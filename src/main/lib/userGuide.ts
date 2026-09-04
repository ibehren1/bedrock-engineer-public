import fs from 'fs'
import path from 'path'

/**
 * The user guide that ships with the build.
 *
 * The Help chat answers from this file, so the shipped copy has to be the one that matches the
 * running build rather than whatever is on GitHub. `electron-builder.yml` copies it into
 * `Resources/docs/` via `extraResources`.
 */

/**
 * Name the guide is saved under inside a chat's attachments folder.
 *
 * Deliberately not `USER_GUIDE.md`: the file lands in the user's project directory, so the name
 * should make it obvious which app put it there.
 */
export const USER_GUIDE_ATTACHMENT_NAME = 'BEDROCK_ENGINEER_USER_GUIDE.md'

/**
 * Where the guide lives at runtime. In development it is read straight out of the repository so
 * edits show up without a rebuild; in a packaged app it comes from `extraResources`.
 */
export const getUserGuidePath = (): string =>
  process.env.NODE_ENV === 'development'
    ? path.join(process.cwd(), 'docs', 'USER_GUIDE.md')
    : path.join(process.resourcesPath, 'docs', 'USER_GUIDE.md')

export const readUserGuide = async (): Promise<string> =>
  fs.promises.readFile(getUserGuidePath(), 'utf-8')

import fs from 'fs'
import path from 'path'
import { getUserGuidePath } from './userGuide'

/**
 * The Help chat is useless if the guide moves and nothing notices, so this pins the repository
 * path the development branch resolves to. The packaged path is covered by the `extraResources`
 * entry in electron-builder.yml, which uses the same file name.
 */
describe('getUserGuidePath', () => {
  const previous = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = previous
  })

  it('resolves to the guide in the repository during development', () => {
    process.env.NODE_ENV = 'development'

    // Jest runs from the repository root, which is what the development branch assumes.
    expect(getUserGuidePath()).toBe(path.join(process.cwd(), 'docs', 'USER_GUIDE.md'))
    expect(fs.existsSync(getUserGuidePath())).toBe(true)
  })
})

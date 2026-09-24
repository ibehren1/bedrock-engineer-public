export * from './types'
export { checkDockerAvailability, getInstallGuidance } from './dockerAvailability'
export {
  createSandbox,
  ensureSandbox,
  execCommand,
  getAvailability,
  getComposeFile,
  getInsights,
  getLogs,
  getSandboxDir,
  getSandboxRoot,
  getStatus,
  isPublishedPort,
  isTrackedSandboxPid,
  listSandboxSessionIds,
  publishState,
  removeSandbox,
  renameSandbox,
  resolveTerminalTarget,
  sandboxStateChannel,
  sendInput,
  startSandbox,
  stopAllSandboxes,
  stopSandbox
} from './sandboxManager'
export type { SandboxComposeFile, SandboxInsights } from './sandboxManager'
export { containerNameFor, slugifyTitle, toFolderName, toProjectName } from './naming'
export {
  activityChannel,
  clearActivity,
  getActivity,
  type SandboxActivityEntry
} from './sandboxActivity'
export {
  attachTerminal,
  closeAllTerminals,
  closeSessionTerminals,
  closeTerminal,
  findSessionTerminal,
  getTerminalBacklog,
  getTerminalCapability,
  openTerminal,
  resizeTerminal,
  terminalChannel,
  writeToTerminal
} from './sandboxTerminal'

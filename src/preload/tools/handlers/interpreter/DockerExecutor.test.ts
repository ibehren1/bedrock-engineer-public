/**
 * DockerExecutor unit tests - focused on core functionality
 */

import { test, expect, jest } from '@jest/globals'
import { DockerExecutor } from './DockerExecutor'
import { SecurityManager } from './SecurityManager'
import { ToolLogger } from '../../base/types'
import { spawn } from 'child_process'
import { EventEmitter } from 'events'

// Mock child_process
jest.mock('child_process')
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>

// Test DockerExecutor checkDockerAvailability functionality
test('DockerExecutor should check Docker availability correctly', async () => {
  // Create mock logger
  const mockLogger: ToolLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    verbose: () => {}
  }

  // Create mock security manager
  const mockSecurityManager = {} as SecurityManager

  const dockerExecutor = new DockerExecutor(mockLogger, mockSecurityManager)

  // Test case 1: Docker is available
  const mockProcess1 = new EventEmitter() as any
  mockProcess1.stdout = new EventEmitter()
  mockProcess1.kill = jest.fn()

  mockSpawn.mockReturnValueOnce(mockProcess1)

  const availabilityPromise1 = dockerExecutor.checkDockerAvailability()

  // Simulate Docker version output
  setTimeout(() => {
    mockProcess1.stdout.emit('data', 'Docker version 20.10.21, build baeda1f')
    mockProcess1.emit('close', 0)
  }, 10)

  const result1 = await availabilityPromise1

  expect(result1.available).toBe(true)
  expect(result1.error).toBeUndefined()
  expect(mockSpawn).toHaveBeenCalledWith('docker', ['--version'], { stdio: 'pipe' })

  // Clear mock for next test
  mockSpawn.mockClear()

  // Test case 2: Docker is not available
  const mockProcess2 = new EventEmitter() as any
  mockProcess2.stdout = new EventEmitter()
  mockProcess2.kill = jest.fn()

  mockSpawn.mockReturnValueOnce(mockProcess2)

  const availabilityPromise2 = dockerExecutor.checkDockerAvailability()

  // Simulate command not found
  setTimeout(() => {
    mockProcess2.emit('close', 127) // Command not found exit code
  }, 10)

  const result2 = await availabilityPromise2

  expect(result2.available).toBe(false)
  expect(result2.error).toBe('Docker not found or not running')
})

test('DockerExecutor should handle Docker command errors', async () => {
  const mockLogger: ToolLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    verbose: () => {}
  }

  const mockSecurityManager = {} as SecurityManager
  const dockerExecutor = new DockerExecutor(mockLogger, mockSecurityManager)

  // Test spawn error
  const mockProcess = new EventEmitter() as any
  mockProcess.stdout = new EventEmitter()
  mockProcess.kill = jest.fn()

  mockSpawn.mockReturnValueOnce(mockProcess)

  const availabilityPromise = dockerExecutor.checkDockerAvailability()

  // Simulate spawn error
  setTimeout(() => {
    mockProcess.emit('error', new Error('spawn docker ENOENT'))
  }, 10)

  const result = await availabilityPromise

  expect(result.available).toBe(false)
  expect(result.error).toBe('spawn docker ENOENT')
})

test('DockerExecutor should stop all containers', async () => {
  const mockLogger: ToolLogger = {
    debug: jest.fn() as any,
    info: jest.fn() as any,
    warn: jest.fn() as any,
    error: jest.fn() as any,
    verbose: jest.fn() as any
  }

  const mockSecurityManager = {} as SecurityManager
  const dockerExecutor = new DockerExecutor(mockLogger, mockSecurityManager)

  // Add mock containers to the running containers map
  const mockProcess1 = { kill: jest.fn() }
  const mockProcess2 = { kill: jest.fn() }

  const runningContainers = (dockerExecutor as any).runningContainers
  runningContainers.set('container1', mockProcess1)
  runningContainers.set('container2', mockProcess2)

  // Execute stopAllContainers
  await dockerExecutor.stopAllContainers()

  // Verify containers were stopped
  expect(mockProcess1.kill).toHaveBeenCalledWith('SIGTERM')
  expect(mockProcess2.kill).toHaveBeenCalledWith('SIGTERM')
  expect(runningContainers.size).toBe(0)

  // Verify logging
  expect(mockLogger.info).toHaveBeenCalledWith('Stopping all running containers', { count: 2 })
})

test('DockerExecutor should handle errors when stopping containers', async () => {
  const mockLogger: ToolLogger = {
    debug: jest.fn() as any,
    info: jest.fn() as any,
    warn: jest.fn() as any,
    error: jest.fn() as any,
    verbose: jest.fn() as any
  }

  const mockSecurityManager = {} as SecurityManager
  const dockerExecutor = new DockerExecutor(mockLogger, mockSecurityManager)

  // Add mock container that throws error when killed
  const mockProcess = {
    kill: jest.fn().mockImplementation(() => {
      throw new Error('Process already stopped')
    })
  }

  const runningContainers = (dockerExecutor as any).runningContainers
  runningContainers.set('container1', mockProcess)

  // Execute stopAllContainers
  await dockerExecutor.stopAllContainers()

  // Verify error was handled
  expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM')
  expect(runningContainers.size).toBe(0)

  // Verify error was logged
  expect(mockLogger.warn).toHaveBeenCalledWith('Failed to stop container', {
    error: 'Process already stopped'
  })
})

test('DockerExecutor should validate basic functionality without external dependencies', () => {
  const mockLogger: ToolLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    verbose: () => {}
  }

  const mockSecurityManager = {} as SecurityManager

  // Test that DockerExecutor can be instantiated
  const dockerExecutor = new DockerExecutor(mockLogger, mockSecurityManager)
  expect(dockerExecutor).toBeDefined()

  // Test private method accessors indirectly
  // These methods are private but their behavior is tested through public methods
  const getExecutionCommand = (dockerExecutor as any).getExecutionCommand
  const getFileExtension = (dockerExecutor as any).getFileExtension

  expect(getExecutionCommand('python', 'test.py')).toEqual(['python', 'test.py'])
  expect(getFileExtension('python')).toBe('.py')
})

test('DockerExecutor should generate correct volume mount commands for single file', () => {
  const mockLogger: ToolLogger = {
    debug: jest.fn() as any,
    info: () => {},
    warn: () => {},
    error: () => {},
    verbose: () => {}
  }

  const mockSecurityManager = {} as SecurityManager
  const dockerExecutor = new DockerExecutor(mockLogger, mockSecurityManager)

  // Test single file mount
  const inputFiles = [{ path: '/home/user/data.csv' }]
  const generateFileVolumeMounts = (dockerExecutor as any).generateFileVolumeMounts.bind(
    dockerExecutor
  )
  const volumeArgs = generateFileVolumeMounts(inputFiles)

  expect(volumeArgs).toEqual(['-v', '/home/user/data.csv:/data/data.csv'])

  // Verify debug logging was called
  expect(mockLogger.debug).toHaveBeenCalledWith('Added file volume mount', {
    hostPath: '/home/user/data.csv',
    containerPath: '/data/data.csv',
    index: 0
  })

  expect(mockLogger.debug).toHaveBeenCalledWith('Input files will be mounted to /data directory', {
    fileCount: 1
  })
})

test('DockerExecutor should generate correct volume mount commands for multiple files', () => {
  const mockLogger: ToolLogger = {
    debug: jest.fn() as any,
    info: () => {},
    warn: () => {},
    error: () => {},
    verbose: () => {}
  }

  const mockSecurityManager = {} as SecurityManager
  const dockerExecutor = new DockerExecutor(mockLogger, mockSecurityManager)

  // Test multiple files mount
  const inputFiles = [
    { path: '/home/user/data1.csv' },
    { path: '/home/user/data2.json' },
    { path: '/home/user/script.py' }
  ]
  const generateFileVolumeMounts = (dockerExecutor as any).generateFileVolumeMounts.bind(
    dockerExecutor
  )
  const volumeArgs = generateFileVolumeMounts(inputFiles)

  expect(volumeArgs).toEqual([
    '-v',
    '/home/user/data1.csv:/data/data1.csv',
    '-v',
    '/home/user/data2.json:/data/data2.json',
    '-v',
    '/home/user/script.py:/data/script.py'
  ])

  // Verify debug logging was called for each file
  expect(mockLogger.debug).toHaveBeenCalledWith('Added file volume mount', {
    hostPath: '/home/user/data1.csv',
    containerPath: '/data/data1.csv',
    index: 0
  })

  expect(mockLogger.debug).toHaveBeenCalledWith('Added file volume mount', {
    hostPath: '/home/user/data2.json',
    containerPath: '/data/data2.json',
    index: 1
  })

  expect(mockLogger.debug).toHaveBeenCalledWith('Added file volume mount', {
    hostPath: '/home/user/script.py',
    containerPath: '/data/script.py',
    index: 2
  })

  expect(mockLogger.debug).toHaveBeenCalledWith('Input files will be mounted to /data directory', {
    fileCount: 3
  })
})

test('DockerExecutor should handle empty input files array', () => {
  const mockLogger: ToolLogger = {
    debug: jest.fn() as any,
    info: () => {},
    warn: () => {},
    error: () => {},
    verbose: () => {}
  }

  const mockSecurityManager = {} as SecurityManager
  const dockerExecutor = new DockerExecutor(mockLogger, mockSecurityManager)

  // Test empty files array
  const inputFiles: any[] = []
  const generateFileVolumeMounts = (dockerExecutor as any).generateFileVolumeMounts.bind(
    dockerExecutor
  )
  const volumeArgs = generateFileVolumeMounts(inputFiles)

  expect(volumeArgs).toEqual([])

  // Verify no debug logging for file mounts
  expect(mockLogger.debug).not.toHaveBeenCalledWith(
    expect.stringContaining('Added file volume mount'),
    expect.any(Object)
  )

  expect(mockLogger.debug).not.toHaveBeenCalledWith(
    expect.stringContaining('Input files will be mounted to /data directory'),
    expect.any(Object)
  )
})

test('DockerExecutor should handle files with same basename correctly', () => {
  const mockLogger: ToolLogger = {
    debug: jest.fn() as any,
    info: () => {},
    warn: () => {},
    error: () => {},
    verbose: () => {}
  }

  const mockSecurityManager = {} as SecurityManager
  const dockerExecutor = new DockerExecutor(mockLogger, mockSecurityManager)

  // Test files with same basename from different directories
  const inputFiles = [
    { path: '/home/user/folder1/data.csv' },
    { path: '/home/user/folder2/data.csv' }
  ]
  const generateFileVolumeMounts = (dockerExecutor as any).generateFileVolumeMounts.bind(
    dockerExecutor
  )
  const volumeArgs = generateFileVolumeMounts(inputFiles)

  // Both files should be mounted to /data with same filename
  // (Note: This might cause conflicts in real usage, but this tests the current implementation)
  expect(volumeArgs).toEqual([
    '-v',
    '/home/user/folder1/data.csv:/data/data.csv',
    '-v',
    '/home/user/folder2/data.csv:/data/data.csv'
  ])

  expect(mockLogger.debug).toHaveBeenCalledWith('Added file volume mount', {
    hostPath: '/home/user/folder1/data.csv',
    containerPath: '/data/data.csv',
    index: 0
  })

  expect(mockLogger.debug).toHaveBeenCalledWith('Added file volume mount', {
    hostPath: '/home/user/folder2/data.csv',
    containerPath: '/data/data.csv',
    index: 1
  })
})

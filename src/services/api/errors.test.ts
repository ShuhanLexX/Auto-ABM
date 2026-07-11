import { describe, expect, test } from 'bun:test'
import { BUSINESS_ERROR_CODES } from '../../constants/businessErrors.js'
import {
  getAssistantMessageFromError,
  getImageUnsupportedErrorMessage,
  isUnsupportedImageInputErrorMessage,
} from './errors.js'

describe('image unsupported API errors', () => {
  test('detects provider-specific text-only model image rejections', () => {
    const unsupportedImageErrors = [
      'This model does not support image blocks',
      'unsupported modality: image input is not available',
      'Failed to deserialize the JSON body into the target type: messages[1]: unknown variant `image_url`, expected `text` at line 1 column 394097',
      "Invalid value for 'messages[0].content[1].type': 'image_url' is not one of ['text']",
      "messages.0.content.1.type: Input should be 'text'; received 'image_url'",
      'image_url content parts are not allowed for this model',
    ]

    for (const message of unsupportedImageErrors) {
      expect(isUnsupportedImageInputErrorMessage(message)).toBe(true)
    }
    expect(isUnsupportedImageInputErrorMessage('image exceeds maximum')).toBe(false)
  })

  test('maps unsupported image rejections to a recoverable synthetic error', () => {
    const msg = getAssistantMessageFromError(
      new Error('This model does not support image blocks'),
      'mimo-v2.5-pro',
    )

    expect(msg.isApiErrorMessage).toBe(true)
    expect(msg.businessErrorCode).toBe(BUSINESS_ERROR_CODES.IMAGE_UNSUPPORTED)
    expect(msg.errorDetails).toBe('This model does not support image blocks')
    expect(msg.message.content[0]).toMatchObject({
      type: 'text',
      text: getImageUnsupportedErrorMessage(),
    })
  })
})

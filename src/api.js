const fetch = require('node-fetch');

/**
 * Send a chat completion request (non-streaming) with tool support.
 * Returns the full response JSON.
 */
async function chatCompletion(credentials, messages, tools, { signal } = {}) {
  const { baseUrl, apiKey, model } = credentials;
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const body = { model, messages };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errBody = await response.text();
    let errMsg;
    try {
      const parsed = JSON.parse(errBody);
      errMsg = parsed.error?.message || errBody;
    } catch {
      errMsg = errBody;
    }
    throw new Error(`API Error (${response.status}): ${errMsg}`);
  }

  return response.json();
}

/**
 * Stream a chat completion (no tools). Calls onToken for each streamed token.
 */
async function streamChat(credentials, messages, onToken, onDone, onError) {
  const { baseUrl, apiKey, model } = credentials;
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      let errMsg;
      try {
        const parsed = JSON.parse(errBody);
        errMsg = parsed.error?.message || errBody;
      } catch {
        errMsg = errBody;
      }
      onError(`API Error (${response.status}): ${errMsg}`);
      return;
    }

    const body = response.body;
    let fullResponse = '';
    let buffer = '';

    body.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          onDone(fullResponse);
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) {
            fullResponse += token;
            onToken(token);
          }
        } catch {
          // skip malformed chunks
        }
      }
    });

    body.on('end', () => {
      if (fullResponse) {
        onDone(fullResponse);
      }
    });

    body.on('error', (err) => {
      onError(`Stream error: ${err.message}`);
    });
  } catch (err) {
    onError(`Connection error: ${err.message}`);
  }
}

module.exports = { chatCompletion, streamChat };

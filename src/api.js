const fetch = require('node-fetch');

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
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
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

module.exports = { streamChat };

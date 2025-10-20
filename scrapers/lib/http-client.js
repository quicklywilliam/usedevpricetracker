import axios from 'axios';

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function fetchPage(url, options = {}) {
  const config = {
    url,
    method: options.method || 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      ...options.headers
    },
    timeout: options.timeout || 30000
  };

  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
    } else if (error.request) {
      throw new Error(`No response received from ${url}`);
    } else {
      throw new Error(`Request failed: ${error.message}`);
    }
  }
}

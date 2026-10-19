import { NextResponse } from 'next/server';

const TARGET_BASE_URL = 'https://opencode.ai/zen/go/v1';
const UPSTREAM_API_KEY = process.env.OPENCODE_API_KEY;

// 根据模型名称决定上游使用的真实路径
function getEndpointByModel(modelName) {
  const name = (modelName || '').toLowerCase();
  if (name.includes('gpt-') || name.includes('grok-')) {
    return '/responses';
  }
  if (name.includes('claude') || name.includes('qwen') || name.includes('minimax')) {
    return '/messages';
  }
  return '/chat/completions';
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

async function handleProxy(request) {
  try {
    if (!UPSTREAM_API_KEY) {
      throw new Error("Missing OPENCODE_API_KEY environment variable");
    }

    const url = new URL(request.url);
    let targetPath = url.pathname.replace('/api/opencode-proxy', '');
    const search = url.search;

    let requestBodyText = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      requestBodyText = await request.text();
    }

    // 动态解析模型名并调整路径与请求体
    if (requestBodyText) {
      try {
        const parsedBody = JSON.parse(requestBodyText);
        if (parsedBody.model) {
          const dynamicEndpoint = getEndpointByModel(parsedBody.model);

          // 如果目标端点是 /responses，需要转换请求体格式
          if (targetPath.includes('/chat/completions') && dynamicEndpoint === '/responses') {
            targetPath = targetPath.replace('/chat/completions', '/responses');

            // 核心转换：messages -> input
            if (parsedBody.messages) {
              parsedBody.input = parsedBody.messages;
              delete parsedBody.messages;
            }

            // 清理 Responses API 不支持的参数
            delete parsedBody.max_tokens;
            delete parsedBody.temperature;
            delete parsedBody.top_p;
            delete parsedBody.frequency_penalty;
            delete parsedBody.presence_penalty;

            // 重新序列化请求体
            requestBodyText = JSON.stringify(parsedBody);
          }
        }
      } catch (e) {
        console.error("Body parse error:", e);
      }
    }

    const targetUrl = `${TARGET_BASE_URL}${targetPath}${search}`;

    const headers = new Headers();
    headers.set('Authorization', `Bearer ${UPSTREAM_API_KEY}`);
    headers.set('Content-Type', 'application/json');

    const session = request.headers.get('x-opencode-session') || 'netlify-session-123';
    headers.set('x-opencode-session', session);

    const fetchOptions = { method: request.method, headers };
    if (requestBodyText) {
      fetchOptions.body = requestBodyText;
    }

    // 发送上游请求
    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.text();

    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error("Proxy Error:", error);
    return new NextResponse(JSON.stringify({
      error: "Netlify Proxy Error",
      details: error.message
    }), {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
    });
  }
}

export { handleProxy as GET, handleProxy as POST };

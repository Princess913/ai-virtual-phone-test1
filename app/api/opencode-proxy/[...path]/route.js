import { NextResponse } from 'next/server';

const TARGET_BASE_URL = 'https://opencode.ai/zen/go/v1';
const UPSTREAM_API_KEY = process.env.OPENCODE_API_KEY;

// 根据模型名称决定上游使用的真实路径
function getEndpointByModel(modelName) {
  const name = (modelName || '').toLowerCase();

  // gpt 和 grok 系列强制走 /responses 协议
  if (name.includes('gpt-') || name.includes('grok-')) {
    return '/responses';
  }
  
  // claude, qwen, minimax 走 /messages 协议
  if (name.includes('claude') || name.includes('qwen') || name.includes('minimax')) {
    return '/messages';
  }

  // 其余（deepseek、glm、kimi、mimo 等）走标准的 /chat/completions
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

    // 动态解析模型名，并据此重写路由路径
    if (requestBodyText) {
      try {
        const parsedBody = JSON.parse(requestBodyText);
        if (parsedBody.model) {
          const dynamicEndpoint = getEndpointByModel(parsedBody.model);
          
          // 如果前端发起的是标准 chat 请求，但模型需要 responses 协议，则调整路径
          if (targetPath.includes('/chat/completions') && dynamicEndpoint === '/responses') {
            targetPath = targetPath.replace('/chat/completions', '/responses');
            // 部分 Responses 协议要求显式字段，可在此适配
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

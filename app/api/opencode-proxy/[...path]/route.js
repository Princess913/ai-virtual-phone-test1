import { NextResponse } from 'next/server';

const TARGET_BASE_URL = 'https://opencode.ai/zen/go/v1';
const UPSTREAM_API_KEY = process.env.OPENCODE_API_KEY;

export const dynamic = 'force-dynamic'; // 确保不被缓存

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

    // 更稳妥的路径提取方式，绕过 Netlify 的 params 解析 Bug
    const url = new URL(request.url);
    const path = url.pathname.replace('/api/opencode-proxy', '');
    const targetUrl = `${TARGET_BASE_URL}${path}${url.search}`;

    const headers = new Headers();
    // 手动构建必要的请求头，避免把浏览器的一堆头带过去被拦截
    headers.set('Authorization', `Bearer ${UPSTREAM_API_KEY}`);
    headers.set('Content-Type', 'application/json');
    headers.set('User-Agent', 'Netlify-Proxy/1.0');
    
    // OpenCode 要求必须带这个 session 头
    if (request.headers.has('x-opencode-session')) {
        headers.set('x-opencode-session', request.headers.get('x-opencode-session'));
    } else {
        headers.set('x-opencode-session', 'netlify-session-123');
    }

    const fetchOptions = {
      method: request.method,
      headers,
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      fetchOptions.body = await request.text();
    }

    // 发起上游请求
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

import { NextResponse } from 'next/server';

// 你的 OpenCode Go API Base URL
const TARGET_BASE_URL = 'https://opencode.ai/zen/go/v1';

// 你的 OpenCode Go API Key (oc_sk_...)
const UPSTREAM_API_KEY = process.env.OPENCODE_API_KEY;

// 处理 CORS 预检请求
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version',
    },
  });
}

// 处理所有代理请求
export async function GET(request, { params }) {
  return handleProxy(request, params);
}

export async function POST(request, { params }) {
  return handleProxy(request, params);
}

// 核心代理逻辑
async function handleProxy(request, params) {
  // 1. 拼接上游完整 URL
  // params.path 是一个数组，例如 ['chat', 'completions']
  const path = params.path ? params.path.join('/') : '';
  const url = new URL(request.url);
  const targetUrl = `${TARGET_BASE_URL}/${path}${url.search}`;

  // 2. 复制并修改请求头
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${UPSTREAM_API_KEY}`);
  // 移除可能导致冲突的 header
  headers.delete('host');
  headers.delete('content-length');
  headers.delete('origin');
  headers.delete('referer');

  // 3. 发起上游请求
  const response = await fetch(targetUrl, {
    method: request.method,
    headers: headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.blob() : undefined,
    // 关键：保持流式响应
    duplex: 'half',
  });

  // 4. 构造返回给前端的响应
  const responseHeaders = new Headers(response.headers);
  // 手动添加 CORS 头，允许你的网页端跨域访问
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

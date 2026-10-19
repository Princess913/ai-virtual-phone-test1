import { NextResponse } from 'next/server';

const TARGET_BASE_URL = 'https://opencode.ai/zen/go/v1';
const UPSTREAM_API_KEY = process.env.OPENCODE_API_KEY;

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

async function handleProxy(request, { params }) {
  try {
    // 在 Netlify 中，params 可能是同步的也可能是异步的
    const pathParams = await params;
    const path = pathParams.path ? pathParams.path.join('/') : '';
    const url = new URL(request.url);
    const targetUrl = `${TARGET_BASE_URL}/${path}${url.search}`;

    const headers = new Headers(request.headers);
    headers.set('Authorization', `Bearer ${UPSTREAM_API_KEY}`);
    headers.delete('host');
    headers.delete('content-length');

    const fetchOptions = {
      method: request.method,
      headers,
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      fetchOptions.body = await request.text();
    }

    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.text(); // 先全量读取，避免流式传输在 Netlify 崩溃

    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error("Proxy Error:", error);
    // 把报错详细信息返回给前端，方便你直接在页面上看到
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

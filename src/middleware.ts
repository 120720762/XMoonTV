/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname, hostname } = request.nextUrl;

  // 判断是否需要跳过认证的路径
  if (shouldSkipAuth(pathname)) {
    return NextResponse.next();
  }

  // 可以加入对域名的判断，确保统一的认证逻辑
  // 假设只对 `yourcustomdomain.com` 进行密码验证
  if (hostname === 'yourcustomdomain.com') {
    const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

    // 从cookie获取认证信息
    const authInfo = getAuthInfoFromCookie(request);

    if (!authInfo) {
      return handleAuthFailure(request, pathname);
    }

    // localstorage模式：直接允许请求继续，无需密码验证
    if (storageType === 'localstorage') {
      return NextResponse.next();
    }

    // 其他模式：只验证签名
    if (!authInfo.username || !authInfo.signature) {
      return handleAuthFailure(request, pathname);
    }

    // 验证签名（如果存在）
    if (authInfo.signature) {
      const isValidSignature = await verifySignature(
        authInfo.username,
        authInfo.signature,
        process.env.PASSWORD || '' // 这里你可以忽略密码，或根据需要使用其他验证方式
      );

      // 签名验证通过即可
      if (isValidSignature) {
        return NextResponse.next();
      }
    }

    // 签名验证失败或不存在签名
    return handleAuthFailure(request, pathname);
  }

  // 如果是其他域名（如 Pages 默认域名），不需要认证
  return NextResponse.next();
}

// 验证签名
async function verifySignature(
  data: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  try {
    // 导入密钥
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // 将十六进制字符串转换为Uint8Array
    const signatureBuffer = new Uint8Array(
      signature.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    // 验证签名
    return await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBuffer,
      messageData
    );
  } catch (error) {
    console.error('签名验证失败:', error);
    return false;
  }
}

// 处理认证失败的情况
function handleAuthFailure(
  request: NextRequest,
  pathname: string
): NextResponse {
  // 如果是 API 路由，返回 401 状态码
  if (pathname.startsWith('/api')) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // 否则重定向到登录页面
  const loginUrl = new URL('/login', request.url);
  // 保留完整的URL，包括查询参数
  const fullUrl = `${pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set('redirect', fullUrl);
  return NextResponse.redirect(loginUrl);
}

// 判断是否需要跳过认证的路径
function shouldSkipAuth(pathname: string): boolean {
  const skipPaths = [
    '/_next',
    '/favicon.ico',
    '/robots.txt',
    '/manifest.json',
    '/icons/',
    '/logo.png',
    '/screenshot.png',
  ];

  return skipPaths.some((path) => pathname.startsWith(path));
}

// 配置middleware匹配规则
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|login|warning|api/login|api/register|api/logout|api/cron|api/server-config).*)',
  ],
};

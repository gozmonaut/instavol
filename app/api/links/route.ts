import { NextResponse } from 'next/server';
import { getLinks } from '@/lib/links';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const links = await getLinks({
    q: searchParams.get('q') ?? undefined,
    category: searchParams.get('category') ?? undefined,
  });

  return NextResponse.json({ links });
}

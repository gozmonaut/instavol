import { NextResponse } from 'next/server';
import { getTagsByUsage } from '@/lib/links';

export async function GET(): Promise<Response> {
  return NextResponse.json({ tags: await getTagsByUsage() });
}

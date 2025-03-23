import { regex } from '@/lib/constants/regex';
import { logger } from '@/lib/logging/logger';
import { isRateLimited } from '@/lib/security/rate-limiter';
import { placeholderBuiltByBitSchema } from '@/lib/validation/integrations/placeholder-built-by-bit-schema';
import { HttpStatus } from '@/types/http-status';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const teamId = searchParams.get('teamId');

  if (!teamId || !regex.uuidV4.test(teamId)) {
    logger.error('Invalid teamId', { teamId });
    return NextResponse.json(
      {
        message: 'Invalid teamId',
      },
      { status: HttpStatus.OK }, // Return 200 to prevent BuiltByBit from retrying the request
    );
  }

  const key = `built-by-bit-integration:${teamId}`;
  const isLimited = await isRateLimited(key, 60, 10); // 60 requests per 10 seconds

  if (isLimited) {
    logger.error('Rate limited', { key });
    return NextResponse.json(
      {
        message: 'Too many requests. Please try again later.',
      },
      { status: HttpStatus.OK }, // Return 200 to prevent BuiltByBit from retrying the request
    );
  }

  try {
    const formData = await request.formData();
    const formDataObject: Record<string, string> = {};

    for (const [key, value] of formData.entries()) {
      formDataObject[key] = value.toString();
    }

    const validated =
      await placeholderBuiltByBitSchema().safeParseAsync(formDataObject);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const validatedData = validated.data;

    logger.info('Received valid placeholder data from BuiltByBit', {
      teamId,
      steam_id: validatedData.steam_id,
      user_id: validatedData.user_id,
      resource_id: validatedData.resource_id,
      version_id: validatedData.version_id,
    });

    // TODO: Return license

    return new Response('LICENSE-KEY');
  } catch (error) {
    logger.error('Error processing form data', { error });
    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error',
      },
      { status: HttpStatus.OK }, // Return 200 to prevent BuiltByBit from retrying
    );
  }
}

import { BuiltByBitIntegration, Limits, Settings, Team } from '@prisma/client';
import prisma from '../database/prisma';
import { generateUniqueLicense } from '../licenses/generate-license';
import { logger } from '../logging/logger';
import { encryptLicenseKey, generateHMAC } from '../security/crypto';
import { PurchaseBuiltByBitSchema } from '../validation/integrations/purchase-built-by-bit-schema';

type ExtendedTeam = Team & {
  settings: Settings | null;
  limits: Limits | null;
  builtByBitIntegration: BuiltByBitIntegration | null;
  _count: {
    licenses: number;
    customers: number;
  };
};

export const handleBuiltByBitPurchase = async (
  buildByBitData: PurchaseBuiltByBitSchema['builtByBitData'],
  lukittuData: PurchaseBuiltByBitSchema['lukittuData'],
  team: ExtendedTeam,
) => {
  const { addon, resource, purchaser } = buildByBitData;
  const { productId, seats, expirationStart, expirationDays, ipLimit } =
    lukittuData;

  const productExists = await prisma.product.findUnique({
    where: {
      id: productId,
    },
  });

  if (!productExists) {
    logger.info('Skipping: Product not found in database', {
      productId,
    });
    return;
  }

  if (team._count.licenses >= (team.limits?.maxLicenses ?? 0)) {
    logger.info('Skipping: Team has reached the maximum number of licenses', {
      teamId: team.id,
      currentLicenses: team._count.licenses,
      maxLicenses: team.limits?.maxLicenses,
    });
    return;
  }

  if (team._count.customers >= (team.limits?.maxCustomers ?? 0)) {
    logger.info('Skipping: Team has reached the maximum number of customers', {
      teamId: team.id,
      currentCustomers: team._count.customers,
      maxCustomers: team.limits?.maxCustomers,
    });
    return;
  }

  const expirationStartFormatted =
    expirationStart?.toUpperCase() === 'ACTIVATION' ? 'ACTIVATION' : 'CREATION';
  const expirationDate =
    (!expirationStart || expirationStart.toUpperCase() === 'CREATION') &&
    expirationDays
      ? new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000)
      : null;

  const metadata = [
    {
      key: 'BBB_USER_ID',
      value: purchaser.userId,
    },
    {
      key: 'BBB_RESOURCE_ID',
      value: resource.resourceId,
    },
    ...(addon.addonId
      ? [
          {
            key: 'BBB_ADDON_ID',
            value: addon.addonId,
          },
        ]
      : []),
  ];

  const license = await prisma.$transaction(async (prisma) => {
    const existingLukittuCustomer = await prisma.customer.findFirst({
      where: {
        metadata: {
          some: {
            key: 'BBB_USER_ID',
            value: purchaser.userId,
          },
        },
        teamId: team.id,
      },
    });
    const lukittuCustomer = await prisma.customer.upsert({
      where: {
        id: existingLukittuCustomer?.id,
        teamId: team.id,
      },
      create: {
        username: purchaser.username,
        teamId: team.id,
        metadata: {
          createMany: {
            data: metadata.map((m) => ({
              ...m,
              teamId: team.id,
            })),
          },
        },
      },
      update: {
        username: purchaser.username,
      },
    });

    const licenseKey = await generateUniqueLicense(team.id);
    const hmac = generateHMAC(`${licenseKey}:${team.id}`);

    if (!licenseKey) {
      logger.error('Failed to generate a unique license key');
      return;
    }

    const encryptedLicenseKey = encryptLicenseKey(licenseKey);

    const license = await prisma.license.create({
      data: {
        licenseKey: encryptedLicenseKey,
        teamId: team.id,
        customers: {
          connect: {
            id: lukittuCustomer.id,
          },
        },
        licenseKeyLookup: hmac,
        metadata: {
          createMany: {
            data: metadata.map((m) => ({
              ...m,
              teamId: team.id,
            })),
          },
        },
        products: {
          connect: {
            id: productId,
          },
        },
        ipLimit,
        seats,
        expirationType: expirationDays ? 'DURATION' : 'NEVER',
        expirationDays: expirationDays || null,
        expirationStart: expirationStartFormatted,
        expirationDate,
      },
      include: {
        products: true,
      },
    });

    return license;
  });

  if (!license) {
    logger.error('Failed to create a license');
    return;
  }

  logger.info('BuildByBit purchase processed successfully', {
    licenseId: license.id,
    teamId: team.id,
    productId,
    resourceId: resource.resourceId,
    resourceTitle: resource.resourceTitle,
    addonId: addon.addonId,
    addonTitle: addon.addonTitle,
  });

  return license;
};

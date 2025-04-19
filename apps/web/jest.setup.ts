import { PrismaClient } from '@lukittu/prisma';
import '@testing-library/jest-dom';
import { mockDeep, mockReset } from 'jest-mock-extended';

export const prismaMock = mockDeep<PrismaClient>();

jest.mock('@lukittu/prisma', () => ({
  __esModule: true,
  prisma: prismaMock,
}));

beforeEach(() => {
  mockReset(prismaMock);
});

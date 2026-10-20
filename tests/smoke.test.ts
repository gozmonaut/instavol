import { appName } from '@/lib/config';
test('app config loads', () => {
  expect(appName).toBe('Instavol');
});

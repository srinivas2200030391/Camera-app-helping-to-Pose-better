/**
 * Camera-permission UI: what the user sees and can do for each permission state.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { PermissionGate } from '../camera/PermissionGate';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@/utils/haptics', () => ({ haptics: { tap: jest.fn(), impact: jest.fn(), shutter: jest.fn(), success: jest.fn(), warning: jest.fn() } }));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

function setup(status: 'undetermined' | 'denied' | 'blocked') {
  const handlers = { onRequest: jest.fn(), onOpenSettings: jest.fn(), onBrowsePoses: jest.fn() };
  return { handlers, view: render(<PermissionGate status={status} {...handlers} />) };
}

describe('PermissionGate', () => {
  it('asks for access when the permission can still be requested', async () => {
    const { handlers, view } = setup('denied');
    await view;
    expect(screen.getByText('Allow camera access')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Allow camera' }));
    expect(handlers.onRequest).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Open settings' })).toBeNull();
  });

  it('sends the user to system settings once Android stops asking', async () => {
    const { handlers, view } = setup('blocked');
    await view;
    expect(screen.getByText('Camera access is off')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Open settings' }));
    expect(handlers.onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('keeps the rest of the app reachable without the camera', async () => {
    const { handlers, view } = setup('blocked');
    await view;
    await fireEvent.press(screen.getByRole('button', { name: 'Browse poses' }));
    expect(handlers.onBrowsePoses).toHaveBeenCalledTimes(1);
  });
});

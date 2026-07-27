import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { setAutoSaveToServer } from '../store/actions/settings';
import Switch from './ui/Switch';
import { SettingsGroup, SettingsRow } from './ui/SettingsList';
import OpenAIKeyRow from './Settings/OpenAISettings';
import CardGenerationRows from './Settings/CardGenerationSettings';
import AnkiRow from './Settings/AnkiSettings';

interface SettingsProps {
  onBackClick: () => void;
  popup: boolean;
}

// Three compact groups, with details kept behind expandable rows. The page opens as a list you can
// read in one glance instead of four expanded panels.
const Settings: React.FC<SettingsProps> = ({ popup = false }) => {
  const dispatch = useDispatch();
  const autoSaveToServer = useSelector((state: RootState) => state.settings.autoSaveToServer);
  const isLoggedIn = useSelector((state: RootState) => Boolean(state.auth.accessToken));

  return (
    <div
      className="mx-auto h-full w-full overflow-y-auto bg-white px-3 pb-10 pt-1"
      style={{ maxWidth: popup ? '100%' : 600 }}
    >
      <div className="flex flex-col gap-4">
        <SettingsGroup caption="Account">
          <OpenAIKeyRow />
        </SettingsGroup>

        <SettingsGroup caption="Card generation">
          <CardGenerationRows />
        </SettingsGroup>

        <SettingsGroup caption="Where cards go">
          <AnkiRow />
          {isLoggedIn && (
            <SettingsRow
              label="Cloud sync"
              control={
                <Switch
                  checked={autoSaveToServer}
                  onChange={(checked) => dispatch(setAutoSaveToServer(checked))}
                  label="Sync saved cards to your Vaulto account"
                />
              }
            />
          )}
        </SettingsGroup>
      </div>
    </div>
  );
};

export default Settings;

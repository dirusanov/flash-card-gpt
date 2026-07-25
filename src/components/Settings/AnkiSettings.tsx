import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import {
    setAnkiConnectApiKey,
    setAnkiConnectUrl,
    setUseAnkiConnect,
} from '../../store/actions/settings';
import { backgroundFetch } from '../../services/backgroundFetch';
import Button from '../ui/Button';
import Disclosure from '../ui/Disclosure';
import Field from '../ui/Field';
import Input from '../ui/Input';
import Switch from '../ui/Switch';
import { SettingsRow } from '../ui/SettingsList';
import TestResult, { TestOutcome } from './TestResult';

const ADDON_CODE = '2055492159';

const AnkiRow: React.FC = () => {
    const dispatch = useDispatch();
    const ankiConnectUrl = useSelector((state: RootState) => state.settings.ankiConnectUrl);
    const ankiConnectApiKey = useSelector((state: RootState) => state.settings.ankiConnectApiKey);
    const useAnkiConnect = useSelector((state: RootState) => state.settings.useAnkiConnect);

    const [showKey, setShowKey] = useState(false);
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState<TestOutcome>(null);

    const config = JSON.stringify(
        {
            apiKey: ankiConnectApiKey || 'your_api_key',
            webCorsOriginList: ['http://localhost', '*'],
            webBindPort: 8765,
        },
        null,
        2
    );

    const testConnection = async () => {
        setTesting(true);
        setResult(null);
        try {
            const response = await backgroundFetch(ankiConnectUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'version', version: 6, key: ankiConnectApiKey }),
            });
            const data = await response.json<any>();
            if (response.ok && !data.error) {
                setResult({ success: true, message: 'Connected to Anki.' });
            } else {
                setResult({
                    success: false,
                    message: data?.error || 'AnkiConnect returned an error.',
                });
            }
        } catch {
            setResult({ success: false, message: 'Could not reach Anki. Is it running?' });
        } finally {
            setTesting(false);
        }
    };

    return (
        <SettingsRow
            label="Anki"
            forceOpen={useAnkiConnect}
            control={
                <Switch
                    checked={useAnkiConnect}
                    onChange={(checked) => dispatch(setUseAnkiConnect(checked))}
                    label="Save cards to Anki"
                />
            }
        >
            <div className="flex flex-col gap-3">
                <Field label="AnkiConnect URL" htmlFor="ankiConnectUrl">
                    <Input
                        id="ankiConnectUrl"
                        value={ankiConnectUrl}
                        onChange={(e) => dispatch(setAnkiConnectUrl(e.target.value))}
                        placeholder="http://127.0.0.1:8765"
                    />
                </Field>

                <Field
                    label="API key"
                    htmlFor="ankiConnectApiKey"
                    hint="Only if you set one in the add-on config."
                >
                    <Input
                        id="ankiConnectApiKey"
                        type={showKey ? 'text' : 'password'}
                        value={ankiConnectApiKey || ''}
                        onChange={(e) => dispatch(setAnkiConnectApiKey(e.target.value))}
                        placeholder="Leave empty if unset"
                        trailing={
                            <Button variant="ghost" size="sm" onClick={() => setShowKey(!showKey)}>
                                {showKey ? 'Hide' : 'Show'}
                            </Button>
                        }
                    />
                </Field>

                <div>
                    <Button size="sm" onClick={testConnection} disabled={testing}>
                        {testing ? 'Checking…' : 'Check connection'}
                    </Button>
                </div>
                <TestResult outcome={result} />

                <Disclosure summary="Setup instructions">
                    <ol className="m-0 flex list-decimal flex-col gap-2 pl-4 text-xs leading-relaxed text-gray-600">
                        <li>
                            In Anki open <strong>Tools → Add-ons → Get Add-ons…</strong>
                        </li>
                        <li className="flex flex-wrap items-center gap-1.5">
                            <span>Enter code</span>
                            <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                                {ADDON_CODE}
                            </code>
                            <button
                                type="button"
                                onClick={() => navigator.clipboard.writeText(ADDON_CODE)}
                                className="rounded px-1.5 py-0.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            >
                                Copy
                            </button>
                        </li>
                        <li>Restart Anki.</li>
                        <li>
                            Open <strong>Tools → Add-ons → AnkiConnect → Config</strong> and paste:
                        </li>
                    </ol>
                    <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(config)}
                        title="Click to copy"
                        className="mt-2 block w-full overflow-x-auto rounded-control bg-gray-900 p-2.5 text-left font-mono text-[11px] leading-relaxed text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                        <pre className="m-0">{config}</pre>
                    </button>
                    <p className="m-0 mt-1 text-center text-[10px] text-gray-400">
                        Click the block to copy
                    </p>
                </Disclosure>
            </div>
        </SettingsRow>
    );
};

export default AnkiRow;

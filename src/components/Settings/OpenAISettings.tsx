import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { setOpenAiKey } from '../../store/actions/settings';
import { OPENAI_TEXT_MODEL } from '../../constants';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { SettingsRow } from '../ui/SettingsList';
import TestResult, { TestOutcome } from './TestResult';

const OpenAIKeyRow: React.FC = () => {
    const dispatch = useDispatch();
    const openAiKey = useSelector((state: RootState) => state.settings.openAiKey);

    const [showKey, setShowKey] = useState(false);
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState<TestOutcome>(null);

    const testConnection = async () => {
        if (!openAiKey.trim()) {
            setResult({ success: false, message: 'Enter your API key first.' });
            return;
        }

        setTesting(true);
        setResult(null);
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${openAiKey}`,
                },
                body: JSON.stringify({
                    model: OPENAI_TEXT_MODEL,
                    messages: [{ role: 'user', content: 'Say hello' }],
                }),
            });
            const data = await response.json();

            if (response.ok) {
                setResult({ success: true, message: 'Connected. Your key works.' });
            } else {
                setResult({ success: false, message: data.error?.message || 'Unknown error.' });
            }
        } catch (error) {
            setResult({
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error.',
            });
        } finally {
            setTesting(false);
        }
    };

    return (
        <SettingsRow
            label="OpenAI key"
            value={openAiKey ? `••••${openAiKey.slice(-4)}` : 'Not set'}
            defaultOpen={!openAiKey}
        >
            <div className="flex flex-col gap-2">
                <Input
                    id="openAiKey"
                    type={showKey ? 'text' : 'password'}
                    value={openAiKey}
                    onChange={(e) => dispatch(setOpenAiKey(e.target.value))}
                    placeholder="sk-…"
                    trailing={
                        <Button variant="ghost" size="sm" onClick={() => setShowKey(!showKey)}>
                            {showKey ? 'Hide' : 'Show'}
                        </Button>
                    }
                />
                <p className="m-0 text-xs leading-snug text-gray-500">
                    Cards, images and pronunciation all use this key. Create one in the{' '}
                    <a
                        href="https://platform.openai.com/account/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-accent underline-offset-2 hover:underline"
                    >
                        OpenAI dashboard
                    </a>
                    .
                </p>
                <div>
                    <Button size="sm" onClick={testConnection} disabled={testing}>
                        {testing ? 'Testing…' : 'Test connection'}
                    </Button>
                </div>
                <TestResult outcome={result} />
            </div>
        </SettingsRow>
    );
};

export default OpenAIKeyRow;

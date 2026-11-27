import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { endpoints } from '../lib/api/endpoints';
import {
  Button,
  Card,
  ErrorState,
  Notice,
  OptionPicker,
  Screen,
  ScreenHeader,
  TextField,
} from '../lib/ui/components';
import { useApp } from '../state/AppContext';

const MODES = [
  { key: 'login', label: 'Sign in / Login' },
  { key: 'register', label: 'Create account / নতুন অ্যাকাউন্ট' },
  { key: 'otpLogin', label: 'OTP login / ওটিপি' },
  { key: 'forgot', label: 'Reset / রিসেট' },
];

const ROLE_OPTIONS = [
  { value: 'FARMER', labelKey: 'onboarding.farmer' },
  { value: 'BUYER', labelKey: 'onboarding.buyer' },
  { value: 'WHOLESALER', labelKey: 'onboarding.wholesaler' },
  { value: 'RETAILER', labelKey: 'onboarding.retailer' },
  { value: 'SUPPLIER', labelKey: 'onboarding.supplier' },
  { value: 'LOGISTICS', labelKey: 'onboarding.logistics' },
  { value: 'WAREHOUSE', labelKey: 'onboarding.warehouse' },
  { value: 'EXPERT', labelKey: 'onboarding.expert' },
  { value: 'INSPECTOR', labelKey: 'onboarding.inspector' },
];

const VERIFICATION_PURPOSE = {
  email: 'EMAIL_VERIFICATION',
  phone: 'PHONE_VERIFICATION',
};

function channelFor(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim()) ? 'email' : 'phone';
}

function previewMessage(result, t) {
  if (!result) return null;
  if (result.previewCode) return t('auth.previewCode', { code: result.previewCode });
  return result.message || null;
}

export default function AuthScreen() {
  const { api, t, signIn } = useApp();
  const [mode, setMode] = useState('login');
  const [stage, setStage] = useState('request');
  const [purpose, setPurpose] = useState(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [channel, setChannel] = useState('email');
  const [role, setRole] = useState('FARMER');
  const [destination, setDestination] = useState('');
  const [code, setCode] = useState('');
  const [purposeToken, setPurposeToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const resetFlowState = () => {
    setError(null);
    setMessage(null);
  };

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setStage('request');
    setPurpose(null);
    setPurposeToken('');
    setCode('');
    setNewPassword('');
    if (nextMode === 'login' || nextMode === 'forgot') {
      setIdentifier(destination || identifier);
    } else {
      setDestination(identifier || destination);
    }
    resetFlowState();
  };

  const verifyCode = async (verificationPurpose) => {
    return api.post(
      endpoints.auth.verifyOtp,
      {
        channel,
        purpose: verificationPurpose,
        destination: destination.trim(),
        code: code.trim(),
      },
      { auth: false },
    );
  };

  const submit = async () => {
    setBusy(true);
    resetFlowState();
    try {
      if (mode === 'login') {
        const tokens = await api.post(
          endpoints.auth.login,
          { identifier: identifier.trim(), password, client: 'mobile' },
          { auth: false },
        );
        await signIn(tokens);
        return;
      }

      if (mode === 'register' && stage === 'request') {
        const email = channel === 'email' ? identifier.trim() : undefined;
        const phone = channel === 'phone' ? identifier.trim() : undefined;
        const result = await api.post(
          channel === 'email' ? endpoints.auth.registerEmail : endpoints.auth.registerPhone,
          {
            ...(email ? { email } : {}),
            ...(phone ? { phone } : {}),
            password,
            profile: {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              preferredLanguage: 'EN',
            },
            requestedRoleCodes: [role],
            client: 'mobile',
          },
          { auth: false },
        );
        setDestination(email || phone || '');
        setPurpose(VERIFICATION_PURPOSE[channel]);
        setStage('code');
        setMessage(previewMessage(result?.verification, t) || t('auth.codeSent'));
        return;
      }

      if (mode === 'register' && stage === 'code') {
        const result = await verifyCode(purpose || VERIFICATION_PURPOSE[channel]);
        setMessage(result?.message || t('auth.verificationSuccess'));
        setCode('');
        setPurpose(null);
        setPassword('');
        setStage('request');
        setMode('login');
        return;
      }

      if (mode === 'otpLogin' && stage === 'request') {
        const result = await api.post(
          endpoints.auth.requestOtp,
          { channel, purpose: 'LOGIN', destination: destination.trim() },
          { auth: false },
        );
        setPurpose('LOGIN');
        setStage('code');
        setMessage(previewMessage(result, t) || t('auth.codeSent'));
        return;
      }

      if (mode === 'otpLogin' && stage === 'code') {
        const result = await verifyCode('LOGIN');
        if (!result?.loginToken) throw new Error(t('auth.invalidPurposeToken'));
        setPurposeToken(result.loginToken);
        setCode('');
        setStage('complete');
        setMessage(t('auth.codeVerified'));
        return;
      }

      if (mode === 'otpLogin' && stage === 'complete') {
        const tokens = await api.post(
          endpoints.auth.loginOtp,
          { loginToken: purposeToken, client: 'mobile' },
          { auth: false },
        );
        await signIn(tokens);
        return;
      }

      if (mode === 'forgot' && stage === 'request') {
        const result = await api.post(
          endpoints.auth.forgotPassword,
          { identifier: identifier.trim() },
          { auth: false },
        );
        setDestination(identifier.trim());
        setChannel(channelFor(identifier));
        setPurpose('PASSWORD_RESET');
        setStage('code');
        setMessage(previewMessage(result, t) || result?.message || t('auth.codeSent'));
        return;
      }

      if (mode === 'forgot' && stage === 'code') {
        const result = await verifyCode('PASSWORD_RESET');
        if (!result?.resetToken) throw new Error(t('auth.invalidPurposeToken'));
        setPurposeToken(result.resetToken);
        setCode('');
        setStage('complete');
        setMessage(t('auth.codeVerified'));
        return;
      }

      if (mode === 'forgot' && stage === 'complete') {
        await api.post(
          endpoints.auth.resetPassword,
          { resetToken: purposeToken, newPassword },
          { auth: false },
        );
        setMessage(t('auth.passwordReset'));
        setStage('request');
        setPurpose(null);
        setPurposeToken('');
        setNewPassword('');
        setMode('login');
      }
    } catch (submitError) {
      setError(submitError);
    } finally {
      setBusy(false);
    }
  };

  const primaryTitle =
    mode === 'login'
      ? t('auth.signIn')
      : mode === 'register'
        ? stage === 'code'
          ? t('auth.verify')
          : t('auth.signUp')
        : mode === 'otpLogin'
          ? stage === 'request'
            ? t('auth.sendCode')
            : stage === 'code'
              ? t('auth.verifyCode')
              : t('auth.signInWithOtp')
          : stage === 'request'
            ? t('auth.sendCode')
            : stage === 'code'
              ? t('auth.verifyCode')
              : t('auth.resetPassword');

  const showIdentifier = mode === 'login' || (mode === 'forgot' && stage === 'request');
  const showDestination = !showIdentifier;
  const showChannel = mode !== 'login' && !(mode === 'forgot' && stage === 'request');
  const showCode = stage === 'code' && mode !== 'login';
  const showNewPassword = mode === 'forgot' && stage === 'complete';

  return (
    <Screen header={<ScreenHeader title={t('appName')} subtitle={t('auth.signInSubtitle')} />}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <OptionPicker options={MODES} value={mode} onChange={changeMode} />
        <Card>
          {mode === 'register' ? (
            <View>
              <OptionPicker
                label={t('auth.requestedRole')}
                options={ROLE_OPTIONS.map((option) => ({
                  value: option.value,
                  label: t(option.labelKey),
                }))}
                value={role}
                onChange={setRole}
              />
              <TextField
                label={t('auth.firstName')}
                value={firstName}
                onChangeText={setFirstName}
              />
              <TextField label={t('auth.lastName')} value={lastName} onChangeText={setLastName} />
            </View>
          ) : null}

          {showIdentifier ? (
            <TextField
              label={t('auth.identifier')}
              value={identifier}
              onChangeText={(value) => {
                setIdentifier(value);
                if (mode === 'forgot') setChannel(channelFor(value));
              }}
              placeholder="name@example.com or 01XXXXXXXXX"
              autoCapitalize="none"
            />
          ) : null}

          {showDestination ? (
            <TextField
              label={channel === 'email' ? t('auth.email') : t('auth.phone')}
              value={destination}
              onChangeText={(value) => {
                setDestination(value);
                setChannel(channelFor(value));
              }}
              keyboardType={channel === 'email' ? 'email-address' : 'phone-pad'}
              autoCapitalize="none"
            />
          ) : null}

          {showChannel ? (
            <OptionPicker
              label={t('common.type')}
              options={[
                { value: 'email', label: t('auth.email') },
                { value: 'phone', label: t('auth.phone') },
              ]}
              value={channel}
              onChange={(nextChannel) => {
                setChannel(nextChannel);
                setPurpose(mode === 'register' ? VERIFICATION_PURPOSE[nextChannel] : purpose);
              }}
            />
          ) : null}

          {['login', 'register'].includes(mode) && stage === 'request' ? (
            <TextField
              label={t('auth.password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          ) : null}

          {showCode ? (
            <TextField
              label={t('auth.code')}
              value={code}
              onChangeText={setCode}
              keyboardType="numeric"
            />
          ) : null}

          {showNewPassword ? (
            <TextField
              label={t('auth.newPassword')}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />
          ) : null}

          {error ? <ErrorState message={error.message || t('common.errorTitle')} /> : null}
          {message ? <Notice>{message}</Notice> : null}

          <View className="mt-4">
            <Button title={primaryTitle} loading={busy} onPress={submit} />
          </View>
          <Text className="mt-4 text-center text-xs text-slate-500">
            {t('appName')} · {t('common.language')}: EN / BN
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

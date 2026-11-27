'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  changePassword,
  channelForIdentifier,
  forgotPassword,
  getFarmerProfile,
  getPurposeState,
  getRoleProfiles,
  getSessions,
  getUserProfile,
  login,
  loginWithOtp,
  logoutAll,
  registerAccount,
  requestOtp,
  resetPassword,
  revokeSession,
  upsertFarmerProfile,
  upsertRoleProfile,
  verifyOtp,
} from '@/lib/auth/client';
import { localizedPath } from '@/lib/i18n';
import {
  Badge,
  Button,
  Checkbox,
  Field,
  Input,
  Radio,
  LoadingState,
  SelectField,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { useAuth } from './auth-provider';
import { useAuthForm } from './form-support';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^(?:\+?88)?01[3-9]\d{8}$/;
const CODE_PATTERN = /^\d{4,10}$/;
const SELF_ROLE_CODES = [
  'FARMER',
  'BUYER',
  'WHOLESALER',
  'RETAILER',
  'AGRICULTURAL_INPUT_SUPPLIER',
  'LOGISTICS_PROVIDER',
  'WAREHOUSE_OPERATOR',
  'AGRICULTURAL_EXPERT',
  'QUALITY_INSPECTOR',
];
const ROLE_FIELDS = {
  BUYER: ['businessName', 'registrationReference'],
  WHOLESALER: ['businessName', 'registrationReference'],
  RETAILER: ['businessName', 'registrationReference'],
  AGRICULTURAL_INPUT_SUPPLIER: ['businessName', 'registrationReference'],
  LOGISTICS_PROVIDER: ['serviceCategory', 'notes'],
  WAREHOUSE_OPERATOR: ['facilityName', 'capacityTonnes'],
  AGRICULTURAL_EXPERT: ['specialization', 'experienceYears'],
  QUALITY_INSPECTOR: ['inspectionScope', 'qualificationReference'],
};
const FARMER_FIELDS = ['farmerCode', 'farmSizeHectares', 'experienceYears'];
const NUMBER_FIELDS = new Set(['farmSizeHectares', 'experienceYears', 'capacityTonnes']);
const INTEGER_FIELDS = new Set(['experienceYears']);
const FIELD_LABEL_KEYS = {
  farmSizeHectares: 'farmSize',
  registrationReference: 'registrationReference',
};

function useValues(initial) {
  const [values, setValues] = useState(initial);
  const set = useCallback((name, value) => {
    setValues((current) => ({ ...current, [name]: value }));
  }, []);
  return [values, set];
}

function identifierError(value, labels) {
  const normalized = String(value || '').trim();
  if (!normalized) return labels.required;
  if (!EMAIL_PATTERN.test(normalized) && !PHONE_PATTERN.test(normalized)) {
    return labels.invalidIdentifier;
  }
  return null;
}

function formatDate(value, locale) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function roleLabel(common, code) {
  return common.roles[code] || `${common.roles.UNKNOWN} (${code})`;
}

function PreviewCode({ title, lead, code }) {
  if (!code) return null;
  return (
    <section className="flex flex-col gap-2 rounded-control border border-info-border bg-info-bg p-4">
      <p className="text-body-sm font-semibold text-content">{title}</p>
      <p className="text-caption text-content-muted">{lead}</p>
      <code className="w-fit rounded-xs bg-surface px-2 py-1 font-mono text-body-lg font-bold tracking-widest text-content">
        {code}
      </code>
    </section>
  );
}

function SuccessNotice({ children }) {
  if (!children) return null;
  return (
    <section
      role="status"
      className="rounded-control border border-success-border bg-success-bg p-4 text-body-sm font-semibold text-content"
    >
      {children}
    </section>
  );
}

export function AuthGate({ locale, dictionary, children }) {
  const { status, isAuthenticated } = useAuth();
  const common = dictionary.auth.common;

  if (status === 'loading') return <LoadingState label={common.loading} />;

  if (!isAuthenticated) {
    return (
      <section className="flex flex-col items-start gap-4 rounded-card border border-line bg-surface p-card">
        <h2 className="text-subheading font-semibold text-content">{common.signInRequiredTitle}</h2>
        <p className="text-body-sm text-content-muted">{common.signInRequiredLead}</p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={localizedPath(locale, '/login')}
            className="text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
          >
            {common.signIn}
          </Link>
          <Link
            href={localizedPath(locale, '/register')}
            className="text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
          >
            {common.createAccount}
          </Link>
        </div>
      </section>
    );
  }

  return children;
}

export function LoginForm({ locale, dictionary }) {
  const content = dictionary.auth.login;
  const common = dictionary.auth.common;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshSession } = useAuth();
  const [mode, setMode] = useState('password');
  const [values, set] = useValues({ identifier: '', password: '', code: '' });
  const [notice, setNotice] = useState(null);
  const [previewCode, setPreviewCode] = useState(null);
  const [otpRequested, setOtpRequested] = useState(false);
  const form = useAuthForm(common);

  const finishSignIn = () => {
    const next = searchParams.get('setup') === '1' ? '/onboarding' : '/account/sessions';
    router.push(localizedPath(locale, next));
    router.refresh();
  };

  async function submitPassword(event) {
    event.preventDefault();
    const errors = {};
    const identifierErrorValue = identifierError(values.identifier, common);
    if (identifierErrorValue) errors.identifier = identifierErrorValue;
    if (!values.password) errors.password = common.required;
    if (Object.keys(errors).length > 0) {
      form.failWith(common.checkFields, errors);
      return;
    }

    const result = await form.run(
      () => login({ identifier: values.identifier.trim(), password: values.password }),
      common.retry,
    );
    if (!result) return;

    await refreshSession();
    setNotice(content.success);
    finishSignIn();
  }

  async function requestLoginCode() {
    const error = identifierError(values.identifier, common);
    if (error) {
      form.failWith(common.checkFields, { identifier: error });
      return;
    }

    const result = await form.run(
      () =>
        requestOtp({
          channel: channelForIdentifier(values.identifier.trim()),
          purpose: 'LOGIN',
          destination: values.identifier.trim(),
        }),
      common.retry,
    );
    if (!result) return;

    setOtpRequested(true);
    setPreviewCode(result.previewCode || null);
    setNotice(content.codeSent);
  }

  async function submitOtp(event) {
    event.preventDefault();
    const errors = {};
    const identifierErrorValue = identifierError(values.identifier, common);
    if (identifierErrorValue) errors.identifier = identifierErrorValue;
    if (!CODE_PATTERN.test(values.code.trim())) errors.code = common.invalidCode;
    if (Object.keys(errors).length > 0) {
      form.failWith(common.checkFields, errors);
      return;
    }

    const destination = values.identifier.trim();
    const channel = channelForIdentifier(destination);
    const result = await form.run(async () => {
      await verifyOtp({ channel, purpose: 'LOGIN', destination, code: values.code.trim() });
      return loginWithOtp();
    }, common.retry);
    if (!result) return;

    await refreshSession();
    setNotice(content.otpSuccess);
    finishSignIn();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2" aria-label={common.signIn}>
        <Button
          type="button"
          variant={mode === 'password' ? 'primary' : 'secondary'}
          size="sm"
          aria-pressed={mode === 'password'}
          onClick={() => setMode('password')}
        >
          {content.passwordTab}
        </Button>
        <Button
          type="button"
          variant={mode === 'otp' ? 'primary' : 'secondary'}
          size="sm"
          aria-pressed={mode === 'otp'}
          onClick={() => setMode('otp')}
        >
          {content.otpTab}
        </Button>
      </div>

      {form.renderSummary()}
      <SuccessNotice>{notice}</SuccessNotice>
      <PreviewCode title={content.requestCode} lead={content.codeSent} code={previewCode} />

      {mode === 'password' ? (
        <form onSubmit={submitPassword} className="flex flex-col gap-4" noValidate>
          <Field
            label={common.identifier}
            hint={content.identifierHint}
            error={form.fields.identifier}
            required
          >
            <Input
              name="identifier"
              type="text"
              autoComplete="username"
              value={values.identifier}
              onChange={(event) => set('identifier', event.target.value)}
              required
            />
          </Field>
          <Field
            label={common.password}
            hint={content.passwordHint}
            error={form.fields.password}
            required
          >
            <Input
              name="password"
              type="password"
              autoComplete="current-password"
              value={values.password}
              onChange={(event) => set('password', event.target.value)}
              required
            />
          </Field>
          <Button type="submit" loading={form.busy} loadingText={content.submitting}>
            {content.submit}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitOtp} className="flex flex-col gap-4" noValidate>
          <Field
            label={common.identifier}
            hint={content.identifierHint}
            error={form.fields.identifier}
            required
          >
            <Input
              name="identifier"
              type="text"
              autoComplete="username"
              value={values.identifier}
              onChange={(event) => set('identifier', event.target.value)}
              required
            />
          </Field>
          <Button
            type="button"
            variant="secondary"
            loading={form.busy}
            loadingText={content.requestingCode}
            onClick={requestLoginCode}
          >
            {content.requestCode}
          </Button>
          {otpRequested ? (
            <Field label={common.code} error={form.fields.code} required>
              <Input
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={values.code}
                onChange={(event) => set('code', event.target.value)}
                required
              />
            </Field>
          ) : null}
          <Button
            type="submit"
            loading={form.busy}
            loadingText={content.verifyingCode}
            disabled={!otpRequested}
          >
            {content.verifyCode}
          </Button>
        </form>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 text-body-sm">
        <Link
          href={localizedPath(locale, '/forgot-password')}
          className="text-brand-700 hover:underline dark:text-brand-300"
        >
          {content.forgotLink}
        </Link>
        <Link
          href={localizedPath(locale, '/register')}
          className="text-brand-700 hover:underline dark:text-brand-300"
        >
          {content.registerLink}
        </Link>
        <Link
          href={localizedPath(locale, '/onboarding')}
          className="text-brand-700 hover:underline dark:text-brand-300"
        >
          {content.setupLink}
        </Link>
      </div>
    </div>
  );
}

export function RegistrationForm({ locale, dictionary }) {
  const content = dictionary.auth.register;
  const common = dictionary.auth.common;
  const [values, set] = useValues({
    channel: 'email',
    email: '',
    phone: '',
    firstName: '',
    lastName: '',
    nameBn: '',
    preferredLanguage: locale === 'bn' ? 'BN' : 'EN',
    password: '',
    confirmPassword: '',
  });
  const [roles, setRoles] = useState(['BUYER']);
  const [result, setResult] = useState(null);
  const { setPendingVerification } = useAuth();
  const form = useAuthForm(common);

  function toggleRole(code) {
    setRoles((current) =>
      current.includes(code) ? current.filter((value) => value !== code) : [...current, code],
    );
  }

  async function submit(event) {
    event.preventDefault();
    const errors = {};
    const destination = values[values.channel];

    if (!values.firstName.trim()) errors.firstName = common.required;
    if (!values.lastName.trim()) errors.lastName = common.required;

    if (!destination.trim()) {
      errors.destination = common.required;
    } else if (values.channel === 'email' && !EMAIL_PATTERN.test(destination.trim())) {
      errors.destination = common.invalidEmail;
    } else if (values.channel === 'phone' && !PHONE_PATTERN.test(destination.trim())) {
      errors.destination = common.invalidPhone;
    }

    if (!values.password) errors.password = common.required;
    if (values.password !== values.confirmPassword)
      errors.confirmPassword = common.passwordMismatch;
    if (roles.length === 0) errors.roles = common.chooseRole;

    if (Object.keys(errors).length > 0) {
      form.failWith(common.checkFields, errors);
      return;
    }

    const response = await form.run(
      () =>
        registerAccount({
          channel: values.channel,
          destination: destination.trim(),
          password: values.password,
          profile: {
            firstName: values.firstName.trim(),
            lastName: values.lastName.trim(),
            nameBn: values.nameBn.trim() || undefined,
            preferredLanguage: values.preferredLanguage,
          },
          requestedRoleCodes: roles,
        }),
      common.retry,
    );
    if (!response) return;

    const purpose = values.channel === 'email' ? 'EMAIL_VERIFICATION' : 'PHONE_VERIFICATION';
    const previewCode = response.verification?.previewCode || null;
    setPendingVerification({
      channel: values.channel,
      purpose,
      destination: destination.trim(),
      previewCode,
    });
    setResult({
      channel: values.channel,
      message: values.channel === 'email' ? content.successEmail : content.successPhone,
      previewCode,
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {form.renderSummary()}
      <SuccessNotice>{result?.message}</SuccessNotice>
      {result ? (
        <div className="flex flex-wrap gap-3">
          <Link
            href={localizedPath(locale, `/verify/${result.channel}?setup=1`)}
            className="text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
          >
            {content.verifyLink}
          </Link>
          <Link
            href={localizedPath(locale, '/login')}
            className="text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
          >
            {content.signInLink}
          </Link>
        </div>
      ) : null}
      <PreviewCode
        title={content.previewTitle}
        lead={content.previewLead}
        code={result?.previewCode}
      />

      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <fieldset className="flex flex-col gap-3">
          <legend className="text-body-sm font-semibold text-content">{common.identifier}</legend>
          <div className="flex flex-wrap gap-4">
            <Radio
              label={content.byEmail}
              name="channel"
              value="email"
              checked={values.channel === 'email'}
              onChange={() => set('channel', 'email')}
            />
            <Radio
              label={content.byPhone}
              name="channel"
              value="phone"
              checked={values.channel === 'phone'}
              onChange={() => set('channel', 'phone')}
            />
          </div>
        </fieldset>

        <Field
          label={values.channel === 'email' ? common.email : common.phone}
          error={form.fields.destination}
          required
        >
          <Input
            name="destination"
            type={values.channel === 'email' ? 'email' : 'tel'}
            autoComplete={values.channel === 'email' ? 'email' : 'tel'}
            value={values[values.channel]}
            onChange={(event) => set(values.channel, event.target.value)}
            required
          />
        </Field>

        <section className="flex flex-col gap-4 rounded-control border border-line p-4">
          <h3 className="text-body-sm font-semibold text-content">{content.profileTitle}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={common.firstName} error={form.fields.firstName} required>
              <Input
                name="firstName"
                autoComplete="given-name"
                value={values.firstName}
                onChange={(event) => set('firstName', event.target.value)}
                required
              />
            </Field>
            <Field label={common.lastName} error={form.fields.lastName} required>
              <Input
                name="lastName"
                autoComplete="family-name"
                value={values.lastName}
                onChange={(event) => set('lastName', event.target.value)}
                required
              />
            </Field>
          </div>
          <Field label={common.nameBn}>
            <Input
              name="nameBn"
              value={values.nameBn}
              onChange={(event) => set('nameBn', event.target.value)}
            />
          </Field>
          <SelectField
            label={common.preferredLanguage}
            value={values.preferredLanguage}
            onChange={(event) => set('preferredLanguage', event.target.value)}
            options={[
              { value: 'EN', label: common.languages.EN },
              { value: 'BN', label: common.languages.BN },
            ]}
          />
        </section>

        <fieldset className="flex flex-col gap-3 rounded-control border border-line p-4">
          <legend className="px-1 text-body-sm font-semibold text-content">
            {content.rolesLabel}
          </legend>
          <p className="text-caption text-content-muted">{content.rolesHint}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SELF_ROLE_CODES.map((code) => (
              <Checkbox
                key={code}
                label={roleLabel(common, code)}
                name="roles"
                value={code}
                checked={roles.includes(code)}
                onChange={() => toggleRole(code)}
              />
            ))}
          </div>
          {form.fields.roles ? (
            <p role="alert" className="text-caption font-medium text-danger">
              {form.fields.roles}
            </p>
          ) : null}
        </fieldset>

        <section className="flex flex-col gap-4 rounded-control border border-line p-4">
          <h3 className="text-body-sm font-semibold text-content">{content.securityTitle}</h3>
          <Field label={common.password} error={form.fields.password} required>
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              value={values.password}
              onChange={(event) => set('password', event.target.value)}
              required
            />
          </Field>
          <Field label={common.confirmPassword} error={form.fields.confirmPassword} required>
            <Input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={values.confirmPassword}
              onChange={(event) => set('confirmPassword', event.target.value)}
              required
            />
          </Field>
        </section>

        <Button type="submit" loading={form.busy} loadingText={content.submitting}>
          {content.submit}
        </Button>
      </form>
    </div>
  );
}

export function VerificationForm({ locale, dictionary, channel }) {
  const content = dictionary.auth.verification;
  const common = dictionary.auth.common;
  const purpose = channel === 'email' ? 'EMAIL_VERIFICATION' : 'PHONE_VERIFICATION';
  const label = channel === 'email' ? common.email : common.phone;
  const searchParams = useSearchParams();
  const { pendingVerification, setPendingVerification, isAuthenticated, refreshSession } =
    useAuth();
  const [values, set] = useValues({ destination: '', code: '' });
  const [previewCode, setPreviewCode] = useState(null);
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState(null);
  const [verified, setVerified] = useState(false);
  const form = useAuthForm(common);

  useEffect(() => {
    if (pendingVerification?.channel === channel && pendingVerification.destination) {
      set('destination', pendingVerification.destination);
      setPreviewCode(pendingVerification.previewCode || null);
      setSent(true);
    }
  }, [channel, pendingVerification, set]);

  async function resend() {
    const error = identifierError(values.destination, common);
    const matchesChannel =
      channel === 'email'
        ? EMAIL_PATTERN.test(values.destination.trim())
        : PHONE_PATTERN.test(values.destination.trim());
    if (error || !matchesChannel) {
      form.failWith(common.checkFields, { destination: error || common.invalidIdentifier });
      return;
    }

    const result = await form.run(
      () => requestOtp({ channel, purpose, destination: values.destination.trim() }),
      common.retry,
    );
    if (!result) return;

    setPreviewCode(result.previewCode || null);
    setSent(true);
    setNotice(content.sent);
  }

  async function submit(event) {
    event.preventDefault();
    const errors = {};
    const error = identifierError(values.destination, common);
    const matchesChannel =
      channel === 'email'
        ? EMAIL_PATTERN.test(values.destination.trim())
        : PHONE_PATTERN.test(values.destination.trim());
    if (error || !matchesChannel) errors.destination = error || common.invalidIdentifier;
    if (!CODE_PATTERN.test(values.code.trim())) errors.code = common.invalidCode;
    if (Object.keys(errors).length > 0) {
      form.failWith(common.checkFields, errors);
      return;
    }

    const result = await form.run(
      () =>
        verifyOtp({
          channel,
          purpose,
          destination: values.destination.trim(),
          code: values.code.trim(),
        }),
      common.retry,
    );
    if (!result) return;

    setPendingVerification(null);
    setVerified(true);
    if (isAuthenticated) await refreshSession();
  }

  const setup = searchParams.get('setup') === '1';
  const nextPath = setup ? '/onboarding' : '/login';
  const nextQuery = setup ? '' : '?setup=1';

  return (
    <div className="flex flex-col gap-5">
      {form.renderSummary()}
      <SuccessNotice>{notice}</SuccessNotice>
      {verified ? (
        <div className="flex flex-col gap-3">
          <SuccessNotice>{content.success}</SuccessNotice>
          <p className="text-body-sm text-content-muted">{content.successLead}</p>
          <Link
            href={`${localizedPath(locale, nextPath)}${nextQuery}`}
            className="w-fit text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
          >
            {setup ? content.continueSetup : content.continueLogin}
          </Link>
        </div>
      ) : null}
      <PreviewCode title={content.previewTitle} lead={content.previewLead} code={previewCode} />

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field
          label={label}
          hint={content.destinationHint}
          error={form.fields.destination}
          required
        >
          <Input
            name="destination"
            type={channel === 'email' ? 'email' : 'tel'}
            autoComplete={channel === 'email' ? 'email' : 'tel'}
            value={values.destination}
            onChange={(event) => set('destination', event.target.value)}
            required
          />
        </Field>
        <Field label={common.code} error={form.fields.code} required>
          <Input
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={values.code}
            onChange={(event) => set('code', event.target.value)}
            required
          />
        </Field>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={form.busy} loadingText={content.verifying}>
            {content.verify}
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={form.busy}
            loadingText={content.sending}
            onClick={resend}
          >
            {sent ? content.resend : content.sendCode}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function ForgotPasswordForm({ locale, dictionary }) {
  const content = dictionary.auth.forgot;
  const common = dictionary.auth.common;
  const [values, set] = useValues({ identifier: '', code: '' });
  const [stage, setStage] = useState('request');
  const [previewCode, setPreviewCode] = useState(null);
  const [notice, setNotice] = useState(null);
  const [verified, setVerified] = useState(false);
  const form = useAuthForm(common);

  async function requestCode(event) {
    event.preventDefault();
    const error = identifierError(values.identifier, common);
    if (error) {
      form.failWith(common.checkFields, { identifier: error });
      return;
    }

    const result = await form.run(
      () => forgotPassword({ identifier: values.identifier.trim() }),
      common.retry,
    );
    if (!result) return;

    setPreviewCode(result.previewCode || null);
    setNotice(result.message || content.accepted);
    setStage('verify');
  }

  async function verifyCode(event) {
    event.preventDefault();
    if (!CODE_PATTERN.test(values.code.trim())) {
      form.failWith(common.checkFields, { code: common.invalidCode });
      return;
    }

    const result = await form.run(
      () =>
        verifyOtp({
          channel: channelForIdentifier(values.identifier.trim()),
          purpose: 'PASSWORD_RESET',
          destination: values.identifier.trim(),
          code: values.code.trim(),
        }),
      common.retry,
    );
    if (!result) return;

    setVerified(true);
    setNotice(content.verified);
  }

  return (
    <div className="flex flex-col gap-5">
      {form.renderSummary()}
      <SuccessNotice>{notice}</SuccessNotice>
      <PreviewCode title={content.previewTitle} lead={content.previewLead} code={previewCode} />

      {stage === 'request' ? (
        <form onSubmit={requestCode} className="flex flex-col gap-4" noValidate>
          <Field
            label={common.identifier}
            hint={content.identifierHint}
            error={form.fields.identifier}
            required
          >
            <Input
              name="identifier"
              type="text"
              autoComplete="username"
              value={values.identifier}
              onChange={(event) => set('identifier', event.target.value)}
              required
            />
          </Field>
          <Button type="submit" loading={form.busy} loadingText={content.submitting}>
            {content.submit}
          </Button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="flex flex-col gap-4" noValidate>
          <p className="text-body-sm text-content-muted">{content.codeTitle}</p>
          <Field label={common.code} error={form.fields.code} required>
            <Input
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={values.code}
              onChange={(event) => set('code', event.target.value)}
              required
            />
          </Field>
          <Button
            type="submit"
            loading={form.busy}
            loadingText={dictionary.auth.verification.verifying}
          >
            {dictionary.auth.verification.verify}
          </Button>
          {verified ? (
            <Link
              href={localizedPath(locale, '/reset-password')}
              className="w-fit text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
            >
              {content.continueLink}
            </Link>
          ) : null}
        </form>
      )}

      <Link
        href={localizedPath(locale, '/login')}
        className="w-fit text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
      >
        {common.backToLogin}
      </Link>
    </div>
  );
}

export function ResetPasswordForm({ locale, dictionary }) {
  const content = dictionary.auth.reset;
  const common = dictionary.auth.common;
  const [values, set] = useValues({ newPassword: '', confirmPassword: '' });
  const [purpose, setPurpose] = useState('loading');
  const [success, setSuccess] = useState(false);
  const form = useAuthForm(common);

  useEffect(() => {
    let active = true;
    getPurposeState()
      .then((result) => {
        if (!active) return;
        setPurpose(result?.reset ? 'present' : 'missing');
      })
      .catch(() => {
        if (active) setPurpose('missing');
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    const errors = {};
    if (!values.newPassword) errors.newPassword = common.required;
    if (values.newPassword !== values.confirmPassword)
      errors.confirmPassword = common.passwordMismatch;
    if (Object.keys(errors).length > 0) {
      form.failWith(common.checkFields, errors);
      return;
    }

    const result = await form.run(
      () => resetPassword({ newPassword: values.newPassword }),
      common.retry,
    );
    if (!result) return;

    setSuccess(true);
    setPurpose('missing');
  }

  if (purpose === 'loading') return <LoadingState label={common.loading} />;

  if (purpose === 'missing' && !success) {
    return (
      <div className="flex flex-col items-start gap-3">
        <h2 className="text-subheading font-semibold text-content">{content.missingTitle}</h2>
        <p className="text-body-sm text-content-muted">{content.missingLead}</p>
        <Link
          href={localizedPath(locale, '/forgot-password')}
          className="text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
        >
          {content.requestLink}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {form.renderSummary()}
      {success ? (
        <div className="flex flex-col gap-3">
          <SuccessNotice>{content.success}</SuccessNotice>
          <p className="text-body-sm text-content-muted">{content.signature}</p>
          <Link
            href={localizedPath(locale, '/login')}
            className="w-fit text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
          >
            {common.backToLogin}
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field
            label={common.newPassword}
            hint={content.newPasswordHint}
            error={form.fields.newPassword}
            required
          >
            <Input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              value={values.newPassword}
              onChange={(event) => set('newPassword', event.target.value)}
              required
            />
          </Field>
          <Field label={common.confirmPassword} error={form.fields.confirmPassword} required>
            <Input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={values.confirmPassword}
              onChange={(event) => set('confirmPassword', event.target.value)}
              required
            />
          </Field>
          <Button type="submit" loading={form.busy} loadingText={content.submitting}>
            {content.submit}
          </Button>
        </form>
      )}
    </div>
  );
}

export function SessionsPanel({ locale, dictionary }) {
  const content = dictionary.auth.sessions;
  const common = dictionary.auth.common;
  const { refreshSession, signOut } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [passwordValues, setPassword] = useValues({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    revokeOtherSessions: true,
  });
  const listForm = useAuthForm(common);
  const passwordForm = useAuthForm(common);
  const { run: runList, renderSummary: renderListSummary } = listForm;

  const loadSessions = useCallback(async () => {
    setLoading(true);
    const result = await runList(() => getSessions(), content.loading);
    setLoading(false);
    if (result) setSessions(Array.isArray(result.sessions) ? result.sessions : []);
  }, [content.loading, runList]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  async function revoke(sessionId) {
    setRevokingId(sessionId);
    const result = await runList(() => revokeSession(sessionId), common.retry);
    setRevokingId(null);
    if (!result) return;

    setNotice(content.revoked);
    await loadSessions();
    await refreshSession();
  }

  async function signOutEverywhere() {
    setLogoutBusy(true);
    const result = await runList(() => logoutAll(), common.retry);
    setLogoutBusy(false);
    if (!result) return;

    setNotice(content.logoutAllSuccess);
    await signOut();
  }

  async function submitPassword(event) {
    event.preventDefault();
    const errors = {};
    if (!passwordValues.currentPassword) errors.currentPassword = common.required;
    if (!passwordValues.newPassword) errors.newPassword = common.required;
    if (passwordValues.newPassword !== passwordValues.confirmPassword) {
      errors.confirmPassword = common.passwordMismatch;
    }
    if (Object.keys(errors).length > 0) {
      passwordForm.failWith(common.checkFields, errors);
      return;
    }

    const result = await passwordForm.run(
      () =>
        changePassword({
          currentPassword: passwordValues.currentPassword,
          newPassword: passwordValues.newPassword,
          revokeOtherSessions: passwordValues.revokeOtherSessions,
        }),
      common.retry,
    );
    if (!result) return;

    setPassword('currentPassword', '');
    setPassword('newPassword', '');
    setPassword('confirmPassword', '');
    setNotice(content.changeSuccess);
    await refreshSession();
  }

  return (
    <div className="flex flex-col gap-6">
      {renderListSummary()}
      <SuccessNotice>{notice}</SuccessNotice>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-subheading font-semibold text-content">{content.title}</h2>
          <p className="text-body-sm text-content-muted">{content.lead}</p>
        </div>
        {loading ? (
          <LoadingState label={content.loading} />
        ) : sessions.length === 0 ? (
          <p className="rounded-control border border-line bg-surface-muted p-4 text-body-sm text-content-muted">
            {content.empty}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{content.created}</TableHead>
                <TableHead>{content.lastSeen}</TableHead>
                <TableHead>{content.ipAddress}</TableHead>
                <TableHead>{content.device}</TableHead>
                <TableHead>
                  <span className="sr-only">{common.save}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell>{formatDate(session.createdAt, locale)}</TableCell>
                  <TableCell>{formatDate(session.lastSeenAt, locale)}</TableCell>
                  <TableCell className="break-all">{session.ipAddress || '—'}</TableCell>
                  <TableCell className="max-w-xs truncate" title={session.userAgent || ''}>
                    {session.userAgent || '—'}
                  </TableCell>
                  <TableCell>
                    {session.isCurrent ? (
                      <Badge tone="success">{content.current}</Badge>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        loading={revokingId === session.id}
                        loadingText={content.revoking}
                        onClick={() => revoke(session.id)}
                      >
                        {content.revoke}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Button
          type="button"
          variant="danger"
          loading={logoutBusy}
          loadingText={content.loggingOutAll}
          onClick={signOutEverywhere}
        >
          {content.logoutAll}
        </Button>
      </section>

      <section className="flex flex-col gap-4 rounded-control border border-line p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-subheading font-semibold text-content">{content.passwordTitle}</h2>
          <p className="text-body-sm text-content-muted">{content.passwordLead}</p>
        </div>
        {passwordForm.renderSummary()}
        <form onSubmit={submitPassword} className="flex flex-col gap-4" noValidate>
          <Field
            label={content.currentPassword}
            error={passwordForm.fields.currentPassword}
            required
          >
            <Input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              value={passwordValues.currentPassword}
              onChange={(event) => setPassword('currentPassword', event.target.value)}
              required
            />
          </Field>
          <Field label={content.newPassword} error={passwordForm.fields.newPassword} required>
            <Input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              value={passwordValues.newPassword}
              onChange={(event) => setPassword('newPassword', event.target.value)}
              required
            />
          </Field>
          <Field
            label={common.confirmPassword}
            error={passwordForm.fields.confirmPassword}
            required
          >
            <Input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={passwordValues.confirmPassword}
              onChange={(event) => setPassword('confirmPassword', event.target.value)}
              required
            />
          </Field>
          <Checkbox
            name="revokeOtherSessions"
            label={content.revokeOthers}
            checked={passwordValues.revokeOtherSessions}
            onChange={(event) => setPassword('revokeOtherSessions', event.target.checked)}
          />
          <Button type="submit" loading={passwordForm.busy} loadingText={content.changing}>
            {content.changeSubmit}
          </Button>
        </form>
      </section>

      <Link
        href={localizedPath(locale, '/onboarding')}
        className="w-fit text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
      >
        {content.setupLink}
      </Link>
    </div>
  );
}

function fieldsForRole(roleCode) {
  return roleCode === 'FARMER' ? FARMER_FIELDS : ROLE_FIELDS[roleCode] || ['notes'];
}

function valuesFromSaved(roleCode, saved) {
  const source = roleCode === 'FARMER' ? saved || {} : saved || {};
  return Object.fromEntries(fieldsForRole(roleCode).map((field) => [field, source?.[field] ?? '']));
}

function savedDisplayData(roleCode, saved) {
  if (!saved || typeof saved !== 'object') return {};
  if (roleCode === 'FARMER') {
    return {
      farmerCode: saved.farmerCode,
      farmSizeHectares: saved.farmSizeHectares,
      experienceYears: saved.experienceYears,
      verificationStatus: saved.verificationStatus,
    };
  }
  return saved.data && typeof saved.data === 'object' ? saved.data : {};
}

export function OnboardingForm({ locale, dictionary }) {
  const content = dictionary.auth.onboarding;
  const common = dictionary.auth.common;
  const [profile, setProfile] = useState(null);
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [saved, setSaved] = useState(null);
  const [values, setValues] = useValues({});
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const form = useAuthForm(common);
  const { run: runForm, failWith: failForm, renderSummary: renderFormSummary } = form;

  const loadProfile = useCallback(async () => {
    setLoading(true);
    const result = await runForm(
      async () => ({
        profile: await getUserProfile(),
        roleProfiles: await getRoleProfiles(),
      }),
      common.loading,
    );
    setLoading(false);
    if (!result) return;

    const profileRoles = Array.isArray(result.profile?.roleCodes) ? result.profile.roleCodes : [];
    const roleCodes = profileRoles.length
      ? profileRoles
      : Array.isArray(result.roleProfiles?.roleCodes)
        ? result.roleProfiles.roleCodes
        : [];

    setProfile(result.profile);
    setRoles(roleCodes);
    setSelectedRole((current) => (roleCodes.includes(current) ? current : roleCodes[0] || ''));
    setSaved(result.roleProfiles?.farmerProfile || null);
  }, [common.loading, runForm]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!selectedRole) return;
    let active = true;

    async function loadRoleData() {
      if (selectedRole === 'FARMER') {
        const result = await runForm(() => getFarmerProfile(), common.loading);
        if (active && result) {
          setSaved(result);
          setValues(valuesFromSaved('FARMER', result));
        }
        return;
      }

      const existing = saved?.roleCode === selectedRole ? saved : null;
      setValues(valuesFromSaved(selectedRole, existing));
    }

    loadRoleData();
    return () => {
      active = false;
    };
    // Reload role data only when the selected role changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRole]);

  async function submit(event) {
    event.preventDefault();
    if (!selectedRole) {
      failForm(common.checkFields, { role: common.chooseRole });
      return;
    }

    const fields = fieldsForRole(selectedRole);
    const data = {};
    const errors = {};
    let filled = 0;

    for (const field of fields) {
      const raw = String(values[field] ?? '').trim();
      if (!raw) continue;
      filled += 1;

      if (NUMBER_FIELDS.has(field)) {
        const number = Number(raw);
        const invalid =
          !Number.isFinite(number) ||
          number < 0 ||
          (INTEGER_FIELDS.has(field) && !Number.isInteger(number));
        if (invalid) {
          errors[field] = INTEGER_FIELDS.has(field)
            ? content.invalidInteger
            : content.invalidNumber;
          continue;
        }
        data[field] = number;
      } else {
        data[field] = raw;
      }
    }

    if (filled === 0) {
      failForm(content.atLeastOne);
      return;
    }
    if (Object.keys(errors).length > 0) {
      failForm(common.checkFields, errors);
      return;
    }

    const result = await runForm(
      () =>
        selectedRole === 'FARMER'
          ? upsertFarmerProfile(data)
          : upsertRoleProfile(selectedRole, { data }),
      common.retry,
    );
    if (!result) return;

    setNotice(content.success);
    await loadProfile();
  }

  const fields = fieldsForRole(selectedRole);
  const displayData =
    selectedRole === 'FARMER'
      ? savedDisplayData('FARMER', saved)
      : savedDisplayData(selectedRole, saved);

  return (
    <div className="flex flex-col gap-6">
      {renderFormSummary()}
      <SuccessNotice>{notice}</SuccessNotice>

      {loading ? <LoadingState label={common.loading} /> : null}

      {!loading ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-subheading font-semibold text-content">{content.rolesTitle}</h2>
          <p className="text-body-sm text-content-muted">{content.rolesLead}</p>
          {roles.length === 0 ? (
            <p className="rounded-control border border-line bg-surface-muted p-4 text-body-sm text-content-muted">
              {content.noRoles}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {roles.map((code) => (
                <Badge key={code} tone={code === selectedRole ? 'brand' : 'neutral'}>
                  {roleLabel(common, code)}
                </Badge>
              ))}
            </div>
          )}
          <SelectField
            label={content.selectRole}
            value={selectedRole}
            error={form.fields.role}
            onChange={(event) => {
              setSelectedRole(event.target.value);
              setSaved(null);
            }}
            options={[
              { value: '', label: content.selectRole },
              ...roles.map((code) => ({ value: code, label: roleLabel(common, code) })),
            ]}
          />
        </section>
      ) : null}

      {!loading && selectedRole ? (
        <section className="flex flex-col gap-4 rounded-control border border-line p-4">
          <h2 className="text-subheading font-semibold text-content">
            {selectedRole === 'FARMER' ? content.farmerTitle : content.profileTitle}
          </h2>
          <p className="text-body-sm text-content-muted">
            {selectedRole === 'FARMER' ? content.farmerLead : content.roleDataHint}
          </p>
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((field) => {
                const labelKey = FIELD_LABEL_KEYS[field] || field;
                const label = content[labelKey] || common.notes;
                return (
                  <Field key={field} label={label} error={form.fields[field]}>
                    <Input
                      name={field}
                      type={NUMBER_FIELDS.has(field) ? 'number' : 'text'}
                      min={NUMBER_FIELDS.has(field) ? 0 : undefined}
                      step={NUMBER_FIELDS.has(field) ? 'any' : undefined}
                      value={values[field] ?? ''}
                      onChange={(event) => setValues(field, event.target.value)}
                    />
                  </Field>
                );
              })}
            </div>
            <Button type="submit" loading={form.busy} loadingText={common.saving}>
              {content.save}
            </Button>
          </form>
        </section>
      ) : null}

      {!loading && selectedRole ? (
        <section className="flex flex-col gap-2 rounded-control border border-line bg-surface-muted p-4">
          <h2 className="text-body-sm font-semibold text-content">{content.savedTitle}</h2>
          {Object.keys(displayData).length === 0 ? (
            <p className="text-body-sm text-content-muted">{content.noSavedData}</p>
          ) : (
            <dl className="grid gap-2 sm:grid-cols-2">
              {Object.entries(displayData).map(([key, value]) => (
                <div key={key} className="flex flex-col gap-0.5">
                  <dt className="text-caption font-semibold uppercase tracking-wider text-content-muted">
                    {content[FIELD_LABEL_KEYS[key] || key] || key}
                  </dt>
                  <dd className="break-words text-body-sm text-content">
                    {value === null || value === undefined || value === ''
                      ? '—'
                      : typeof value === 'object'
                        ? JSON.stringify(value)
                        : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      ) : null}

      {profile ? (
        <section className="flex flex-col gap-3 rounded-control border border-line p-4">
          <h2 className="text-body-sm font-semibold text-content">{content.verificationTitle}</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href={localizedPath(locale, '/verify/email?setup=1')}
              className="text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
            >
              {content.verifyEmail}
            </Link>
            <Badge tone={profile.isEmailVerified ? 'success' : 'warning'}>
              {profile.isEmailVerified ? content.verified : content.notVerified}
            </Badge>
            <Link
              href={localizedPath(locale, '/verify/phone?setup=1')}
              className="text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
            >
              {content.verifyPhone}
            </Link>
            <Badge tone={profile.isPhoneVerified ? 'success' : 'warning'}>
              {profile.isPhoneVerified ? content.verified : content.notVerified}
            </Badge>
          </div>
          <Link
            href={localizedPath(locale, '/account/sessions')}
            className="w-fit text-body-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
          >
            {content.sessionsLink}
          </Link>
        </section>
      ) : null}
    </div>
  );
}

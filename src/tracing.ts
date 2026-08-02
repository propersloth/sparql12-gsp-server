// src/tracing.ts
//
// OpenTelemetry SDK bootstrap (NFR-05). Must be imported/required before any
// other application module so that auto-instrumentation can patch Node's
// http/express/pg modules before they are first required. Enabled/disabled
// and configured via the same GSP_OTEL_* environment variables documented in
// application-design.md §10.1.
//
// This file is intentionally excluded from unit-test coverage (see
// jest.config.js `collectCoverageFrom`) — it is a side-effecting bootstrap
// script, not a unit of testable logic. OtelService (src/common/logging/otel.service.ts)
// carries the testable tracing behaviour.
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const otelEnabled = process.env.GSP_OTEL_ENABLED === 'true';

let sdk: NodeSDK | undefined;

if (otelEnabled) {
  const endpoint = process.env.GSP_OTEL_ENDPOINT || 'http://localhost:4318';
  const serviceName = process.env.GSP_OTEL_SERVICE_NAME || 'gsp-server';
  const sampleRatio = parseFloat(process.env.GSP_OTEL_SAMPLE_RATIO || '1.0');

  sdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
    sampler: new TraceIdRatioBasedSampler(sampleRatio),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  const shutdown = () => {
    sdk
      ?.shutdown()
      .then(() => console.log('OpenTelemetry tracing terminated'))
      .catch((error) => console.error('Error terminating OpenTelemetry tracing', error))
      .finally(() => process.exit(0));
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

export default sdk;

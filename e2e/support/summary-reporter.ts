import fs from 'fs'
import path from 'path'
import type {
  FullConfig, FullResult, Reporter, Suite, TestCase, TestResult,
} from '@playwright/test/reporter'

/**
 * Writes reports/summary.md after every run
 */

const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')

type Row = { test: TestCase, result: TestResult }

class SummaryReporter implements Reporter {
  private rows: Row[] = []

  private root = ''

  private started = new Date()

  onBegin(config: FullConfig, _suite: Suite): void {
    this.root = config.rootDir ? path.resolve(config.rootDir, '..') : process.cwd()
    this.started = new Date()
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.rows.push({ test, result })
  }

  private name(test: TestCase): string {
    const project = test.parent.project()?.name || ''
    return `[${project}] ${test.titlePath().slice(3).join(' › ')}`
  }

  private rel(p: string): string {
    return path.relative(this.root, p).split(path.sep).join('/')
  }

  onEnd(result: FullResult): void {
    const count = (s: string) => this.rows.filter((r) => r.result.status === s).length
    const failed = this.rows.filter((r) => ['failed', 'timedOut', 'interrupted'].includes(r.result.status))
    const icon = { passed: 'PASS', failed: 'FAIL', timedOut: 'FAIL', skipped: 'SKIP', interrupted: 'STOP' } as const

    const out: string[] = []
    out.push(`# E2E test run ${this.started.toISOString().replace('T', ' ').slice(0, 19)} UTC`)
    out.push('')
    out.push(`Result: **${result.status}**: ${count('passed')} passed, ${failed.length} failed, ${count('skipped')} skipped`
      + ` (${Math.round((Date.now() - this.started.getTime()) / 1000)}s)`)
    out.push('')
    out.push(`- UI: ${process.env.FDP_UI_URL || 'http://localhost:8088'}`)
    out.push(`- API: ${process.env.FDP_API_URL || '(UI)/stage-fdp-api'}`)
    out.push(`- User: ${process.env.FDP_USER || 'admin@example.com'}`)
    out.push(`- Run id: ${process.env.FDP_RUN_ID || ''}`)
    out.push('')
    out.push('## Tests')
    out.push('')
    for (const { test, result: r } of this.rows) {
      const reason = r.status === 'skipped'
        ? ` (${test.annotations.filter((a) => a.type === 'skip').map((a) => a.description).join('; ') || 'skipped'})`
        : ''
      out.push(`- ${icon[r.status] || r.status} ${this.name(test)} (${(r.duration / 1000).toFixed(1)}s)${reason}`)
    }

    if (failed.length) {
      out.push('')
      out.push('## Failures')
      for (const { test, result: r } of failed) {
        out.push('')
        out.push(`### ${this.name(test)}`)
        out.push('')
        out.push(`${this.rel(test.location.file)}:${test.location.line}`)
        out.push('')
        out.push('```')
        for (const error of r.errors) {
          out.push(stripAnsi(error.message || String(error.value || '')).split('\n').slice(0, 40).join('\n'))
        }
        out.push('```')
        const log = r.attachments.find((a) => a.name === 'browser-log')
        if (log && log.body) {
          out.push('')
          out.push('Browser log:')
          out.push('```')
          out.push(log.body.toString('utf8').split('\n').slice(-60).join('\n'))
          out.push('```')
        }
        const files = r.attachments.filter((a) => a.path).map((a) => `${a.name}: ${this.rel(a.path as string)}`)
        if (files.length) {
          out.push('')
          out.push(files.map((f) => `- ${f}`).join('\n'))
        }
      }
    }

    const text = `${out.join('\n')}\n`
    const reports = path.join(this.root, 'reports')
    const logs = path.join(reports, 'logs')
    fs.mkdirSync(logs, { recursive: true })
    fs.writeFileSync(path.join(reports, 'summary.md'), text)
    const stamp = process.env.FDP_LOG_STAMP || this.started.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
    fs.writeFileSync(path.join(logs, `summary-${stamp}.md`), text)
  }
}

export default SummaryReporter

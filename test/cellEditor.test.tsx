import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CellEditor } from '../src/core/CellEditors'

describe('CellEditor (text)', () => {
  it('commits on Enter and inserts newline on Shift+Enter', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(
      <CellEditor
        inputType="text"
        initialValue="hello"
        onCommit={onCommit}
        onCancel={() => {}}
      />,
    )
    const textarea = screen.getByRole('textbox')
    await user.type(textarea, '{Shift>}{Enter}{/Shift}world')
    expect(textarea).toHaveValue('hello\nworld')
    await user.keyboard('{Enter}')
    expect(onCommit).toHaveBeenCalledWith('hello\nworld', undefined)
  })

  it('cancels on Escape', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onCommit = vi.fn()
    render(
      <CellEditor inputType="text" initialValue="v" onCommit={onCommit} onCancel={onCancel} />,
    )
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('commits with next-navigation on Tab and prev on Shift+Tab', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    const { unmount } = render(
      <CellEditor inputType="text" initialValue="a" onCommit={onCommit} onCancel={() => {}} />,
    )
    await user.keyboard('{Tab}')
    expect(onCommit).toHaveBeenCalledWith('a', 'next')
    unmount()

    const onCommit2 = vi.fn()
    render(
      <CellEditor inputType="text" initialValue="b" onCommit={onCommit2} onCancel={() => {}} />,
    )
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(onCommit2).toHaveBeenCalledWith('b', 'prev')
  })

  it('commits on blur exactly once', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(
      <>
        <CellEditor inputType="text" initialValue="x" onCommit={onCommit} onCancel={() => {}} />
        <button type="button">outside</button>
      </>,
    )
    await user.click(screen.getByRole('button', { name: 'outside' }))
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('x', undefined)
  })
})

describe('CellEditor (number)', () => {
  it('commits a parsed number', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(
      <CellEditor inputType="number" initialValue="10" onCommit={onCommit} onCancel={() => {}} />,
    )
    const input = screen.getByRole('spinbutton')
    await user.clear(input)
    await user.type(input, '42')
    await user.keyboard('{Enter}')
    expect(onCommit).toHaveBeenCalledWith(42, undefined)
  })
})

describe('CellEditor (boolean)', () => {
  it('commits the toggled boolean immediately', async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(
      <CellEditor
        inputType="boolean"
        initialValue="false"
        onCommit={onCommit}
        onCancel={() => {}}
      />,
    )
    await user.click(screen.getByRole('checkbox'))
    expect(onCommit).toHaveBeenCalledWith(true, undefined)
  })
})

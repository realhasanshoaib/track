import * as React from "react"
import { Combobox } from "@base-ui/react/combobox"
import { Check, ChevronDown, Search } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select"
import { cn } from "#/lib/utils"

type NativeSelectChangeEvent = {
  currentTarget: { value: string }
  target: { value: string }
}

type NativeSelectProps = React.AriaAttributes & {
  autoComplete?: string
  autoFocus?: boolean
  children: React.ReactNode
  className?: string
  disabled?: boolean
  form?: string
  id?: string
  name?: string
  onBlur?: React.FocusEventHandler<HTMLButtonElement>
  onChange?: (event: NativeSelectChangeEvent) => void
  onFocus?: React.FocusEventHandler<HTMLButtonElement>
  required?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  size?: "sm" | "default"
  tabIndex?: number
  title?: string
  value: string
}

type NativeSelectOptionProps = {
  children: React.ReactNode
  disabled?: boolean
  value: string
}

type SelectOption = {
  disabled: boolean
  key: React.Key
  label: React.ReactNode
  labelText: string
  value: string
}

function NativeSelect({
  "aria-describedby": ariaDescribedBy,
  "aria-errormessage": ariaErrorMessage,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  autoComplete,
  autoFocus,
  children,
  className,
  disabled,
  form,
  id,
  name,
  onBlur,
  onChange,
  onFocus,
  required,
  searchable = false,
  searchPlaceholder,
  size = "default",
  tabIndex,
  title,
  value,
}: NativeSelectProps) {
  const options = collectOptions(children)
  const selectedOption = options.find((option) => option.value === value) ?? null

  if (searchable) {
    return (
      <SearchableNativeSelect
        aria-describedby={ariaDescribedBy}
        aria-errormessage={ariaErrorMessage}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className={className}
        disabled={disabled}
        form={form}
        id={id}
        name={name}
        onBlur={onBlur}
        onChange={onChange}
        onFocus={onFocus}
        options={options}
        required={required}
        searchPlaceholder={searchPlaceholder}
        size={size}
        tabIndex={tabIndex}
        title={title}
        value={selectedOption}
      />
    )
  }

  return (
    <div
      className={cn("group/native-select relative w-fit", className)}
      data-control-kind="value"
      data-size={size}
      data-slot="native-select-wrapper"
    >
      <Select
        autoComplete={autoComplete}
        disabled={disabled}
        form={form}
        id={id}
        isItemEqualToValue={(option, selected) => option.value === selected.value}
        itemToStringLabel={(option) => option.labelText}
        itemToStringValue={(option) => option.value}
        name={name}
        onValueChange={(nextOption) => {
          if (nextOption === null) return
          const eventTarget = { value: nextOption.value }
          onChange?.({ currentTarget: eventTarget, target: eventTarget })
        }}
        required={required}
        value={selectedOption}
      >
        <SelectTrigger
          aria-describedby={ariaDescribedBy}
          aria-errormessage={ariaErrorMessage}
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-required={required || undefined}
          autoFocus={autoFocus}
          className="w-full"
          data-slot="native-select"
          onBlur={onBlur}
          onFocus={onFocus}
          size={size}
          tabIndex={tabIndex}
          title={title}
        >
          <SelectValue>{selectedOption?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem disabled={option.disabled} key={option.key} value={option}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

function SearchableNativeSelect({
  "aria-describedby": ariaDescribedBy,
  "aria-errormessage": ariaErrorMessage,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  autoComplete,
  autoFocus,
  className,
  disabled,
  form,
  id,
  name,
  onBlur,
  onChange,
  onFocus,
  options,
  required,
  searchPlaceholder,
  size,
  tabIndex,
  title,
  value,
}: {
  "aria-describedby"?: string
  "aria-errormessage"?: string
  "aria-invalid"?: NativeSelectProps["aria-invalid"]
  "aria-label"?: string
  "aria-labelledby"?: string
  autoComplete?: string
  autoFocus?: boolean
  className?: string
  disabled?: boolean
  form?: string
  id?: string
  name?: string
  onBlur?: React.FocusEventHandler<HTMLElement>
  onChange?: NativeSelectProps["onChange"]
  onFocus?: React.FocusEventHandler<HTMLElement>
  options: Array<SelectOption>
  required?: boolean
  searchPlaceholder?: string
  size: "sm" | "default"
  tabIndex?: number
  title?: string
  value: SelectOption | null
}) {
  return (
    <div
      className={cn("group/native-select relative w-fit", className)}
      data-control-kind="value"
      data-size={size}
      data-slot="native-select-wrapper"
    >
      <Combobox.Root
        autoComplete={autoComplete}
        disabled={disabled}
        filter={(option, query) => option.labelText.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())}
        form={form}
        isItemEqualToValue={(option, selected) => option.value === selected.value}
        itemToStringLabel={(option) => option.labelText}
        itemToStringValue={(option) => option.value}
        items={options}
        name={name}
        onValueChange={(nextOption) => {
          if (nextOption === null) return
          const eventTarget = { value: nextOption.value }
          onChange?.({ currentTarget: eventTarget, target: eventTarget })
        }}
        required={required}
        value={value}
      >
        <Combobox.InputGroup
          className={cn(
            "task-filter-select track-dropdown-input flex min-w-36 items-center gap-1 rounded-md border border-input bg-input/20 px-2.5 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 dark:bg-input/30",
            size === "sm" ? "min-h-[var(--control-sm,2.25rem)]" : "min-h-[var(--control-md,2.5rem)]",
          )}
          data-control-kind="value"
          data-size={size}
          data-slot="searchable-select-group"
        >
          <Search aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <Combobox.Input
            aria-describedby={ariaDescribedBy}
            aria-errormessage={ariaErrorMessage}
            aria-invalid={ariaInvalid}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-required={required || undefined}
            autoFocus={autoFocus}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs/relaxed text-foreground shadow-none outline-none placeholder:text-muted-foreground focus-visible:border-0 focus-visible:ring-0"
            data-control-kind="value"
            data-slot="searchable-select-input"
            form={form}
            id={id}
            onBlur={(event) => onBlur?.(event)}
            onFocus={(event) => onFocus?.(event)}
            placeholder={searchPlaceholder ?? `Search ${ariaLabel?.toLocaleLowerCase() ?? "options"}…`}
            tabIndex={tabIndex}
            title={title}
          />
          <Combobox.Trigger
            aria-label={`Show ${ariaLabel ?? "options"}`}
            className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50"
            data-control-kind="value"
            data-slot="searchable-select-trigger"
            type="button"
          >
            <ChevronDown aria-hidden="true" className="size-3.5" />
          </Combobox.Trigger>
        </Combobox.InputGroup>
        <Combobox.Portal>
          <Combobox.Positioner align="start" className="isolate z-50" side="bottom" sideOffset={4}>
            <Combobox.Popup
              className="track-dropdown-input-menu relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:transition-none motion-reduce:animate-none"
              data-slot="select-content"
            >
              <Combobox.List className="scroll-my-1 p-1">
                {(option) => (
                  <Combobox.Item
                    className="relative flex min-h-7 w-full cursor-default items-center gap-2 rounded-md px-2 py-1 text-xs/relaxed outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50"
                    data-slot="select-item"
                    key={option.key}
                    value={option}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    <Combobox.ItemIndicator className="flex shrink-0 items-center justify-center">
                      <Check aria-hidden="true" className="size-3.5" />
                    </Combobox.ItemIndicator>
                  </Combobox.Item>
                )}
              </Combobox.List>
              <Combobox.Empty className="px-3 py-2 text-xs text-muted-foreground">
                No matching options.
              </Combobox.Empty>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  )
}

function collectOptions(children: React.ReactNode): Array<SelectOption> {
  const options: Array<SelectOption> = []

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    if (child.type === React.Fragment) {
      const fragment = child as React.ReactElement<{ children?: React.ReactNode }>
      options.push(...collectOptions(fragment.props.children))
      return
    }
    if (child.type !== NativeSelectOption) return

    const props = child.props as NativeSelectOptionProps
    options.push({
      disabled: Boolean(props.disabled),
      key: child.key ?? props.value,
      label: props.children,
      labelText: typeof props.children === "string" ? props.children : props.value,
      value: props.value,
    })
  })

  return options
}

function NativeSelectOption(_props: NativeSelectOptionProps) {
  return null
}

export { NativeSelect, NativeSelectOption }

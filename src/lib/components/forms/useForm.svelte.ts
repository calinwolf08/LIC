/**
 * Form State Management with Svelte 5 Runes
 *
 * A lightweight form utility that provides:
 * - Client-side validation with Zod
 * - Field-level state (touched, dirty, errors)
 * - Accessibility attributes
 * - Progressive enhancement support
 */

import type { ZodSchema, ZodError as ZodErrorType } from 'zod';

export type FieldState = {
	touched: boolean;
	dirty: boolean;
	errors: string[];
};

export type FormState<T extends Record<string, any>> = {
	values: T;
	fields: Record<keyof T, FieldState>;
	isSubmitting: boolean;
	isValid: boolean;
};

export type UseFormOptions<T extends Record<string, any>> = {
	initialValues: T;
	validationSchema: ZodSchema<T>;
	onSubmit: (values: T) => Promise<void> | void;
	validateOnChange?: boolean;
	validateOnBlur?: boolean;
};

export function useForm<T extends Record<string, any>>(options: UseFormOptions<T>) {
	const { initialValues, validationSchema, onSubmit, validateOnChange = false, validateOnBlur = true } = options;

	// Initialize state with $state rune
	let state = $state<FormState<T>>({
		values: { ...initialValues },
		fields: Object.keys(initialValues).reduce((acc, key) => {
			acc[key as keyof T] = { touched: false, dirty: false, errors: [] };
			return acc;
		}, {} as Record<keyof T, FieldState>),
		isSubmitting: false,
		isValid: true
	});

	// Validate a single field
	function validateField(name: keyof T): string[] {
		try {
			// Validate the entire form but only return errors for this field
			validationSchema.parse(state.values);
			return [];
		} catch (error) {
			const zodError = error as ZodErrorType;
			const fieldErrors = zodError.errors
				.filter(err => err.path[0] === name)
				.map(err => err.message);
			return fieldErrors;
		}
	}

	// Validate all fields
	function validateForm(): boolean {
		try {
			validationSchema.parse(state.values);
			// Clear all errors
			Object.keys(state.fields).forEach(key => {
				state.fields[key as keyof T].errors = [];
			});
			state.isValid = true;
			return true;
		} catch (error) {
			const zodError = error as ZodErrorType;
			// Group errors by field
			const errorsByField: Record<string, string[]> = {};
			zodError.errors.forEach(err => {
				const fieldName = err.path[0] as string;
				if (!errorsByField[fieldName]) {
					errorsByField[fieldName] = [];
				}
				errorsByField[fieldName].push(err.message);
			});

			// Update field errors
			Object.keys(state.fields).forEach(key => {
				state.fields[key as keyof T].errors = errorsByField[key] || [];
			});

			state.isValid = false;
			return false;
		}
	}

	// Handle field change
	function handleChange(name: keyof T, value: any) {
		state.values[name] = value;
		state.fields[name].dirty = value !== initialValues[name];

		if (validateOnChange && state.fields[name].touched) {
			state.fields[name].errors = validateField(name);
		}
	}

	// Handle field blur
	function handleBlur(name: keyof T) {
		state.fields[name].touched = true;

		if (validateOnBlur) {
			state.fields[name].errors = validateField(name);
		}
	}

	// Handle form submit
	async function handleSubmit(event: Event) {
		event.preventDefault();

		// Mark all fields as touched
		Object.keys(state.fields).forEach(key => {
			state.fields[key as keyof T].touched = true;
		});

		// Validate
		const isValid = validateForm();
		if (!isValid) {
			// Focus first field with error
			const firstErrorField = Object.keys(state.fields).find(
				key => state.fields[key as keyof T].errors.length > 0
			);
			if (firstErrorField) {
				const element = document.querySelector(`[name="${String(firstErrorField)}"]`) as HTMLElement;
				element?.focus();
			}
			return;
		}

		// Submit
		state.isSubmitting = true;
		try {
			await onSubmit(state.values);
		} finally {
			state.isSubmitting = false;
		}
	}

	// Reset form
	function reset() {
		state.values = { ...initialValues };
		state.fields = Object.keys(initialValues).reduce((acc, key) => {
			acc[key as keyof T] = { touched: false, dirty: false, errors: [] };
			return acc;
		}, {} as Record<keyof T, FieldState>);
		state.isSubmitting = false;
		state.isValid = true;
	}

	// Get field props for input elements
	function getFieldProps(name: keyof T) {
		const field = state.fields[name];
		const hasError = field.touched && field.errors.length > 0;

		return {
			name: String(name),
			value: state.values[name],
			'aria-invalid': hasError,
			'aria-describedby': hasError ? `${String(name)}-error` : undefined,
			onchange: (e: Event) => {
				const target = e.target as HTMLInputElement;
				handleChange(name, target.value);
			},
			onblur: () => handleBlur(name)
		};
	}

	return {
		get values() { return state.values; },
		get fields() { return state.fields; },
		get isSubmitting() { return state.isSubmitting; },
		get isValid() { return state.isValid; },
		get isDirty() {
			return Object.values(state.fields).some(field => field.dirty);
		},
		handleChange,
		handleBlur,
		handleSubmit,
		validateForm,
		reset,
		getFieldProps
	};
}

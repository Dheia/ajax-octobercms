import { Config } from "./config";
import { Actions } from "./actions";
import { Data } from "./data";
import { Events } from "../util/events";
import { HttpRequest } from "../util/http-request";
import { Deferred } from "../util/deferred";

export class Request
{
    constructor(element, handler, config) {
        this.el = element;
        this.handler = handler;
        this.config = config || {};
        this.context = { el: element, handler: handler, config: this.config, options: this.config };
        this.actions = new Actions(this, this.context, config || {});
    }

    start() {
        this.notifyApplicationAjaxSetup();
        this.initOtherElements();

        if (!this.validateClientSideForm() || !this.applicationAllowsRequest()) {
            return;
        }

        // Prepare request
        const data = Data.fetch(this.config.data, this.el, this.formEl);
        const { url, headers, method } = Config.fetch(this.handler, this.config);
        this.request = new HttpRequest(this, url, { method, headers, data, trackAbort: true });
        this.promise = new Deferred({ delegate: this.request });
        this.isRedirect = this.config.redirect && this.config.redirect.length > 0;

        // Confirm before sending
        if (this.config.confirm && !this.actions.invoke('handleConfirmMessage', [this.config.confirm])) {
            return;
        }

        // Send request
        var self = this;
        this.notifyApplicationBeforeSend();
        this.notifyApplicationAjaxPromise();
        this.promise
            .fail(function(data, responseCode, xhr) {
                if (!self.isRedirect) {
                    self.notifyApplicationAjaxFail(data, responseCode, xhr);
                }
            })
            .done(function(data, responseCode, xhr) {
                if (!self.isRedirect) {
                    self.notifyApplicationAjaxDone(data, responseCode, xhr);
                }
            })
            .always(function(data, responseCode, xhr) {
                self.notifyApplicationAjaxAlways(data, responseCode, xhr);
            });

        this.request.send();
        return this.promise;
    }

    static send(handler, config) {
        return (new Request(document, handler, config)).start();
    }

    static sendElement(element, handler, config) {
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }

        return (new Request(element, handler, config)).start();
    }

    toggleRedirect(redirectUrl) {
        if (!redirectUrl) {
            this.config.redirect = null;
            this.isRedirect = false;
        }
        else {
            this.config.redirect = redirectUrl;
            this.isRedirect = true;
        }
    }

    applicationAllowsRequest() {
        const event = this.notifyApplicationBeforeRequest();
        return !event.defaultPrevented;
    }

    applicationAllowsUpdate(data, responseCode, xhr) {
        const event = this.notifyApplicationBeforeUpdate(data, responseCode, xhr);
        return !event.defaultPrevented;
    }

    applicationAllowsError(message, responseCode, xhr) {
        const event = this.notifyApplicationRequestError(message, responseCode, xhr);
        return !event.defaultPrevented;
    }

    // Application events
    notifyApplicationAjaxSetup() {
        return Events.dispatch('ajax:setup', { target: this.el, detail: { context: this.context } });
    }

    notifyApplicationAjaxPromise() {
        return Events.dispatch('ajax:promise', { target: this.el, detail: { context: this.context } });
    }

    notifyApplicationAjaxFail(data, responseCode, xhr) {
        return Events.dispatch('ajax:fail', { target: this.el, detail: { context: this.context, data, responseCode, xhr } });
    }

    notifyApplicationAjaxDone(data, responseCode, xhr) {
        return Events.dispatch('ajax:done', { target: this.el, detail: { context: this.context, data, responseCode, xhr } });
    }

    notifyApplicationAjaxAlways(data, responseCode, xhr) {
        return Events.dispatch('ajax:always', { target: this.el, detail: { context: this.context, data, responseCode, xhr } });
    }

    notifyApplicationAjaxUpdate(target, data, responseCode, xhr) {
        return Events.dispatch('ajax:update', { target, detail: { context: this.context, data, responseCode, xhr } });
    }

    notifyApplicationBeforeRedirect() {
        return Events.dispatch('ajax:before-redirect', { target: this.el });
    }

    notifyApplicationBeforeRequest() {
        return Events.dispatch('ajax:before-request', { target: this.triggerEl, detail: { context: this.context } });
    }

    notifyApplicationBeforeUpdate(data, responseCode, xhr) {
        return Events.dispatch('ajax:before-update', { target: this.triggerEl, detail: { context: this.context, data, responseCode, xhr } });
    }

    notifyApplicationRequestSuccess(data, responseCode, xhr) {
        return Events.dispatch('ajax:request-success', { target: this.triggerEl, detail: { context: this.context, data, responseCode, xhr } });
    }

    notifyApplicationRequestError(message, responseCode, xhr) {
        return Events.dispatch('ajax:request-error', { target: this.triggerEl, detail: { context: this.context, message, responseCode, xhr } });
    }

    notifyApplicationRequestComplete(data, responseCode, xhr) {
        return Events.dispatch('ajax:request-complete', { target: this.triggerEl, detail: { context: this.context, data, responseCode, xhr } });
    }

    notifyApplicationBeforeValidate(message, fields) {
        return Events.dispatch('ajax:before-validate', { target: this.triggerEl, detail: { context: this.context, message, fields } });
    }

    notifyApplicationBeforeReplace(target) {
        return Events.dispatch('ajax:before-replace', { target });
    }

    // Window-based events
    notifyApplicationBeforeSend() {
        return Events.dispatch('ajax:before-send', { target: window, detail: { context: this.context } });
    }

    notifyApplicationUpdateComplete(data, responseCode, xhr) {
        return Events.dispatch('ajax:update-complete', { target: window, detail: { context: this.context, data, responseCode, xhr } });
    }

    notifyApplicationFieldInvalid(element, fieldName, fieldMessages, isFirst) {
        return Events.dispatch('ajax:invalid-field', { target: window, detail: { element, fieldName, fieldMessages, isFirst } });
    }

    notifyApplicationConfirmMessage(message, promise) {
        return Events.dispatch('ajax:confirm-message', { target: window, detail: { message, promise } });
    }

    notifyApplicationErrorMessage(message) {
        return Events.dispatch('ajax:error-message', { target: window, detail: { message } });
    }

    // HTTP request delegate
    requestStarted() {
        this.toggleLoaderState(true);
    }

    requestProgressed(progress) {
        this.promise.notify(progress);
    }

    requestCompletedWithResponse(response, statusCode, redirectedToLocation) {
        if (redirectedToLocation) this.toggleRedirect(redirectedToLocation);
        this.actions.invoke('success', [response, statusCode, this.request.xhr]);
        this.actions.invoke('complete', [response, statusCode, this.request.xhr]);
        this.promise.resolve(response, statusCode, this.request.xhr);
    }

    requestFailedWithStatusCode(statusCode, response) {
        this.actions.invoke('error', [response, statusCode, this.request.xhr]);
        this.actions.invoke('complete', [response, statusCode, this.request.xhr]);
        this.promise.reject(response, statusCode, this.request.xhr);
    }

    requestFinished() {
        this.toggleLoaderState(false);
    }

    // Private
    initOtherElements() {
        if (this.config.form) {
            this.formEl = document.querySelector(this.config.form);
        }
        else {
            this.formEl = this.el !== document ? this.el.closest('form') : null;
        }

        this.triggerEl = this.formEl ? this.formEl : this.el;

        this.loadingEl = typeof this.config.loading === 'string'
            ? document.querySelector(this.config.loading)
            : this.config.loading;
    }

    validateClientSideForm() {
        if (
            this.config.browserValidate &&
            typeof document.createElement('input').reportValidity === 'function' &&
            this.formEl &&
            !this.formEl.checkValidity()
        ) {
            this.formEl.reportValidity();
            return false;
        }

        return true;
    }

    toggleLoaderState(isLoading) {
        if (!this.loadingEl) {
            return;
        }

        if (
            typeof this.loadingEl.show !== 'function' ||
            typeof this.loadingEl.hide !== 'function'
        ) {
            this.loadingEl.style.display = isLoading ? 'block' : 'none';
            return;
        }

        if (isLoading) {
            this.loadingEl.show();
        }
        else {
            this.loadingEl.hide();
        }
    }
}

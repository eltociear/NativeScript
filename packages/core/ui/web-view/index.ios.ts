import { WebViewNavigationType } from '.';
import { disableZoomProperty, WebViewBase } from './web-view-common';
import { profile } from '../../profiling';
import { Trace } from '../../trace';
export * from './web-view-common';
import { knownFolders } from '../../file-system';

@NativeClass
class WKNavigationDelegateImpl extends NSObject implements WKNavigationDelegate {
	public static ObjCProtocols = [WKNavigationDelegate];
	public static initWithOwner(owner: WeakRef<WebView>): WKNavigationDelegateImpl {
		const handler = <WKNavigationDelegateImpl>WKNavigationDelegateImpl.new();
		handler._owner = owner;

		return handler;
	}
	private _owner: WeakRef<WebView>;

	public webViewDecidePolicyForNavigationActionDecisionHandler(webView: WKWebView, navigationAction: WKNavigationAction, decisionHandler: any): void {
		const owner = this._owner.get();
		if (owner && navigationAction.request.URL) {
			let navType: WebViewNavigationType = 'other';

			switch (navigationAction.navigationType) {
				case WKNavigationType.LinkActivated:
					navType = 'linkClicked';
					break;
				case WKNavigationType.FormSubmitted:
					navType = 'formSubmitted';
					break;
				case WKNavigationType.BackForward:
					navType = 'backForward';
					break;
				case WKNavigationType.Reload:
					navType = 'reload';
					break;
				case WKNavigationType.FormResubmitted:
					navType = 'formResubmitted';
					break;
			}
			decisionHandler(WKNavigationActionPolicy.Allow);

			if (Trace.isEnabled()) {
				Trace.write('WKNavigationDelegateClass.webViewDecidePolicyForNavigationActionDecisionHandler(' + navigationAction.request.URL.absoluteString + ', ' + navigationAction.navigationType + ')', Trace.categories.Debug);
			}
			owner._onLoadStarted(navigationAction.request.URL.absoluteString, navType);
		}
	}

	public webViewDidStartProvisionalNavigation(webView: WKWebView, navigation: WKNavigation): void {
		if (Trace.isEnabled()) {
			Trace.write('WKNavigationDelegateClass.webViewDidStartProvisionalNavigation(' + webView.URL + ')', Trace.categories.Debug);
		}
	}

	public webViewDidFinishNavigation(webView: WKWebView, navigation: WKNavigation): void {
		if (Trace.isEnabled()) {
			Trace.write('WKNavigationDelegateClass.webViewDidFinishNavigation(' + webView.URL + ')', Trace.categories.Debug);
		}
		const owner = this._owner.get();
		if (owner) {
			let src = owner.src;
			if (webView.URL) {
				src = webView.URL.absoluteString;
			}
			owner._onLoadFinished(src);
		}
	}

	public webViewDidFailNavigationWithError(webView: WKWebView, navigation: WKNavigation, error: NSError): void {
		const owner = this._owner.get();
		if (owner) {
			let src = owner.src;
			if (webView.URL) {
				src = webView.URL.absoluteString;
			}
			if (Trace.isEnabled()) {
				Trace.write('WKNavigationDelegateClass.webViewDidFailNavigationWithError(' + error.localizedDescription + ')', Trace.categories.Debug);
			}
			owner._onLoadFinished(src, error.localizedDescription);
		}
	}

	public webViewDidFailProvisionalNavigationWithError(webView: WKWebView, navigation: WKNavigation, error: NSError): void {
		const owner = this._owner.get();
		if (owner) {
			let src = owner.src;
			if (webView.URL) {
				src = webView.URL.absoluteString;
			}
			if (Trace.isEnabled()) {
				Trace.write('WKNavigationDelegateClass.webViewDidFailProvisionalNavigationWithError(' + error.localizedDescription + ')', Trace.categories.Debug);
			}
			owner._onLoadFinished(src, error.localizedDescription);
		}
	}
}

@NativeClass
class WKUIDelegateImpl extends NSObject implements WKUIDelegate {
	public static ObjCProtocols = [WKUIDelegate];
	public static initWithOwner(owner: WeakRef<WebView>): WKUIDelegateImpl {
		const handler = <WKUIDelegateImpl>WKUIDelegateImpl.new();
		handler._owner = owner;
		return handler;
	}
	private _owner: WeakRef<WebView>;

	webViewCreateWebViewWithConfigurationForNavigationActionWindowFeatures(webView: WKWebView, configuration: WKWebViewConfiguration, navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures): WKWebView {
		if (navigationAction && (!navigationAction.targetFrame || (navigationAction.targetFrame && !navigationAction.targetFrame.mainFrame))) {
			webView.loadRequest(navigationAction.request);
		}
		return null;
	}
}

@NativeClass
@ObjCClass(UIScrollViewDelegate)
class UIScrollViewDelegateImpl extends NSObject implements UIScrollViewDelegate {
	public static initWithOwner(owner: WeakRef<WebView>): UIScrollViewDelegateImpl {
		const handler = <UIScrollViewDelegateImpl>UIScrollViewDelegateImpl.new();
		handler._owner = owner;

		return handler;
	}

	private _owner: WeakRef<WebView>;

	private _initCurrentValues(scrollView: UIScrollView) {
		const owner = this._owner.get();
		if (owner && (owner._minimumZoomScale === undefined || owner._maximumZoomScale === undefined || owner._zoomScale === undefined)) {
			owner._minimumZoomScale = scrollView.minimumZoomScale;
			owner._maximumZoomScale = scrollView.maximumZoomScale;
			owner._zoomScale = scrollView.zoomScale;
		}
	}

	private _handleDisableZoom(scrollView: UIScrollView) {
		const owner = this._owner.get();
		if (owner.disableZoom) {
			this._initCurrentValues(scrollView);
			scrollView.maximumZoomScale = 1.0;
			scrollView.minimumZoomScale = 1.0;
			scrollView.zoomScale = 1.0;
		}
	}

	scrollViewWillBeginZoomingWithView(scrollView: UIScrollView, view: UIView) {
		this._handleDisableZoom(scrollView);
	}

	scrollViewDidZoom(scrollView) {
		this._handleDisableZoom(scrollView);
	}
}

export class WebView extends WebViewBase {
	nativeViewProtected: WKWebView;
	private _delegate: WKNavigationDelegateImpl;
	private _scrollDelegate: UIScrollViewDelegateImpl;
	private _uiDelegate: WKUIDelegateImpl;

	_maximumZoomScale;
	_minimumZoomScale;
	_zoomScale;

	createNativeView() {
		const jScript = "var meta = document.createElement('meta'); meta.setAttribute('name', 'viewport'); meta.setAttribute('content', 'initial-scale=1.0'); document.getElementsByTagName('head')[0].appendChild(meta);";
		const wkUScript = WKUserScript.alloc().initWithSourceInjectionTimeForMainFrameOnly(jScript, WKUserScriptInjectionTime.AtDocumentEnd, true);
		const wkUController = WKUserContentController.new();
		wkUController.addUserScript(wkUScript);
		const configuration = WKWebViewConfiguration.new();
		configuration.userContentController = wkUController;
		configuration.preferences.setValueForKey(true, 'allowFileAccessFromFileURLs');

		return new WKWebView({
			frame: CGRectZero,
			configuration: configuration,
		});
	}

	initNativeView() {
		super.initNativeView();
		this._delegate = WKNavigationDelegateImpl.initWithOwner(new WeakRef(this));
		this._scrollDelegate = UIScrollViewDelegateImpl.initWithOwner(new WeakRef(this));
		this._uiDelegate = WKUIDelegateImpl.initWithOwner(new WeakRef(this));
		this.ios.navigationDelegate = this._delegate;
		this.ios.scrollView.delegate = this._scrollDelegate;
		this.ios.UIDelegate = this._uiDelegate;
	}

	@profile
	public onLoaded() {
		super.onLoaded();
	}

	public onUnloaded() {
		super.onUnloaded();
	}

	// @ts-ignore
	get ios(): WKWebView {
		return this.nativeViewProtected;
	}

	public stopLoading() {
		this.ios.stopLoading();
	}

	public _loadUrl(src: string) {
		if (src.startsWith('file:///')) {
			const cachePath = src.substring(0, src.lastIndexOf('/'));
			this.ios.loadFileURLAllowingReadAccessToURL(NSURL.URLWithString(src), NSURL.URLWithString(cachePath));
		} else {
			this.ios.loadRequest(NSURLRequest.requestWithURL(NSURL.URLWithString(src)));
		}
	}

	public _loadData(content: string) {
		this.ios.loadHTMLStringBaseURL(content, NSURL.alloc().initWithString(`file:///${knownFolders.currentApp().path}/`));
	}

	get canGoBack(): boolean {
		return this.ios.canGoBack;
	}

	get canGoForward(): boolean {
		return this.ios.canGoForward;
	}

	public goBack() {
		this.ios.goBack();
	}

	public goForward() {
		this.ios.goForward();
	}

	public reload() {
		this.ios.reload();
	}

	[disableZoomProperty.setNative](value: boolean) {
		if (!value && typeof this._minimumZoomScale === 'number' && typeof this._maximumZoomScale === 'number' && typeof this._zoomScale === 'number') {
			if (this.ios.scrollView) {
				this.ios.scrollView.minimumZoomScale = this._minimumZoomScale;
				this.ios.scrollView.maximumZoomScale = this._maximumZoomScale;
				this.ios.scrollView.zoomScale = this._zoomScale;
				this._minimumZoomScale = undefined;
				this._maximumZoomScale = undefined;
				this._zoomScale = undefined;
			}
		}
	}
}

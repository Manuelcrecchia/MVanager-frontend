import Foundation
import Capacitor
import PDFKit
import UIKit

@objc(NativePdfViewerPlugin)
public class NativePdfViewerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativePdfViewerPlugin"
    public let jsName = "NativePdfViewer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "present", returnType: CAPPluginReturnPromise)
    ]

    @objc func present(_ call: CAPPluginCall) {
        guard
            let encoded = call.getString("base64Data"),
            let data = Data(base64Encoded: encoded),
            let document = PDFDocument(data: data)
        else {
            call.reject("Il documento PDF non è valido")
            return
        }

        let title = call.getString("title") ?? "Documento PDF"
        let fileName = sanitizedFileName(call.getString("fileName") ?? "document.pdf")

        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("Impossibile aprire il visualizzatore PDF")
                return
            }

            let controller = NativePdfViewController(
                document: document,
                data: data,
                title: title,
                fileName: fileName
            )
            controller.onClose = {
                call.resolve()
            }

            let navigation = UINavigationController(rootViewController: controller)
            navigation.modalPresentationStyle = .fullScreen
            presenter.present(navigation, animated: true)
        }
    }

    private func sanitizedFileName(_ value: String) -> String {
        let invalid = CharacterSet(charactersIn: "/\\?%*:|\"<>")
        let cleaned = value.components(separatedBy: invalid).joined(separator: " ")
        return cleaned.isEmpty ? "document.pdf" : cleaned
    }
}

private final class NativePdfViewController: UIViewController {
    var onClose: (() -> Void)?

    private let pdfView = PDFView()
    private let document: PDFDocument
    private let data: Data
    private let fileName: String
    private var temporaryFileURL: URL?

    init(document: PDFDocument, data: Data, title: String, fileName: String) {
        self.document = document
        self.data = data
        self.fileName = fileName
        super.init(nibName: nil, bundle: nil)
        self.title = title
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        navigationItem.leftBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .close,
            target: self,
            action: #selector(closeViewer)
        )
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .action,
            target: self,
            action: #selector(shareDocument)
        )

        pdfView.translatesAutoresizingMaskIntoConstraints = false
        pdfView.backgroundColor = .secondarySystemBackground
        pdfView.displayMode = .singlePageContinuous
        pdfView.displayDirection = .vertical
        pdfView.displaysPageBreaks = true
        pdfView.pageBreakMargins = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
        pdfView.autoScales = true
        pdfView.document = document

        view.addSubview(pdfView)
        NSLayoutConstraint.activate([
            pdfView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            pdfView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            pdfView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            pdfView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        pdfView.autoScales = true
        pdfView.minScaleFactor = pdfView.scaleFactorForSizeToFit * 0.75
        pdfView.maxScaleFactor = max(pdfView.scaleFactorForSizeToFit * 8, 4)
    }

    deinit {
        if let temporaryFileURL {
            try? FileManager.default.removeItem(at: temporaryFileURL)
        }
    }

    @objc private func closeViewer() {
        dismiss(animated: true) { [weak self] in
            self?.onClose?()
        }
    }

    @objc private func shareDocument() {
        do {
            let directory = FileManager.default.temporaryDirectory
                .appendingPathComponent("mvanager-pdf", isDirectory: true)
            try FileManager.default.createDirectory(
                at: directory,
                withIntermediateDirectories: true
            )
            let url = directory.appendingPathComponent(fileName)
            try data.write(to: url, options: .atomic)
            temporaryFileURL = url

            let activity = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            activity.popoverPresentationController?.barButtonItem = navigationItem.rightBarButtonItem
            present(activity, animated: true)
        } catch {
            let alert = UIAlertController(
                title: "Documento non disponibile",
                message: "Non è stato possibile preparare il PDF per la condivisione.",
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: "OK", style: .default))
            present(alert, animated: true)
        }
    }
}

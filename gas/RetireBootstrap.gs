/**
 * Retire production bootstrap POST integration.
 *
 * This file is the versioned POST fragment for the existing production
 * bootstrap file 程式碼.gs. Keep that file's doGet, jsonResponse_, and
 * legacy read-only behavior unchanged when applying this fragment.
 */
function doPost(e) {
  try {
    const contents = e && e.postData && e.postData.contents;
    const body = JSON.parse(contents || '{}');
    return jsonResponse_(retireAdminAction_(body));
  } catch (error) {
    return jsonResponse_({
      success: false,
      error: String(error && error.message ? error.message : error)
    });
  }
}
